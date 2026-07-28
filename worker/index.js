const YOUVERSION_API = 'https://api.youversion.com/v1';
const TIME_ZONE = 'America/Los_Angeles';
const DAILY_TTL_SECONDS = 8 * 24 * 60 * 60;
const VERSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const PASSAGE_TTL_SECONDS = 30 * 24 * 60 * 60;

export const TRANSLATIONS = Object.freeze({
  WEB: { key: 'WEB', label: 'WEB', bibleId: 206 },
  NIV: { key: 'NIV', label: 'NIV', bibleId: 111 },
  NIRV: { key: 'NIRV', label: 'NIrV', bibleId: 110 },
  NASB2020: { key: 'NASB2020', label: 'NASB 2020', bibleId: 2692 },
  CUV: {
    key: 'CUV',
    label: 'CUV',
    bibleId: 0,
    local: true,
    metadata: {
      id: 0,
      abbreviation: 'CUV',
      title: 'Chinese Union Version (Simplified)',
      localized_title: '和合本',
      copyright: 'Public Domain',
      promotional_content: '',
      youversion_deep_link: 'https://ebible.org/details.php?id=cmn-cu89s',
    },
  },
  CCB: { key: 'CCB', label: 'CCB', bibleId: 36 },
  CCBT: { key: 'CCBT', label: 'CCBT', bibleId: 1392 },
  KLB: { key: 'KLB', label: 'KLB', bibleId: 86 },
});

const PASSAGE_ID_PATTERN = /^[1-3]?[A-Z]{2,3}\.\d+\.\d+(?:-\d+)?$/;

function json(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function dateInfo(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const dayOfYear = Math.floor(
    (Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / 86_400_000,
  );

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    dayOfYear,
  };
}

async function youVersionJson(path, appKey) {
  const response = await fetch(`${YOUVERSION_API}${path}`, {
    headers: {
      Accept: 'application/json',
      'X-YVP-App-Key': appKey,
    },
  });

  if (!response.ok) {
    throw new Error(`YouVersion API returned ${response.status}`);
  }

  return response.json();
}

function requireTranslation(key) {
  const translation = TRANSLATIONS[key];
  if (!translation) throw new Error('Unsupported Bible translation');
  return translation;
}

function requirePassageId(passageId) {
  if (!PASSAGE_ID_PATTERN.test(passageId)) {
    throw new Error('Invalid YouVersion passage id');
  }
  return passageId;
}

function assertConfigured(env) {
  if (!env.YVP_APP_KEY) {
    throw new Error('YVP_APP_KEY is not configured');
  }
  if (!env.DAILY_VERSE_KV) {
    throw new Error('DAILY_VERSE_KV is not configured');
  }
}

async function getBibleMetadata(env, translation) {
  if (translation.local) {
    return { value: translation.metadata, cache: 'HIT' };
  }
  const cacheKey = `bible:${translation.bibleId}:metadata`;
  const cached = await env.DAILY_VERSE_KV.get(cacheKey, 'json');
  if (cached) return { value: cached, cache: 'HIT' };

  const metadata = await youVersionJson(
    `/bibles/${translation.bibleId}`,
    env.YVP_APP_KEY,
  );
  await env.DAILY_VERSE_KV.put(cacheKey, JSON.stringify(metadata), {
    expirationTtl: VERSION_TTL_SECONDS,
  });
  return { value: metadata, cache: 'MISS' };
}

async function getLocalCuvPassage(env, passageId) {
  if (!env.ASSETS) {
    throw new Error('Local CUV assets are not configured');
  }
  const match = passageId.match(
    /^([1-3]?[A-Z]{2,3})\.(\d+)\.(\d+)(?:-(\d+))?$/,
  );
  if (!match) throw new Error('Invalid YouVersion passage id');
  const [, book, chapter, firstText, lastText] = match;
  const first = Number(firstText);
  const last = Number(lastText ?? firstText);
  const response = await env.ASSETS.fetch(
    new Request(`https://local-assets.invalid/cuv/${book}.json`),
  );
  if (!response.ok) {
    throw new Error(`Local CUV book ${book} is unavailable`);
  }
  const data = await response.json();
  const chapterData = data?.chapters?.[chapter];
  const verses = [];
  for (let verse = first; verse <= last; verse += 1) {
    const text = chapterData?.[String(verse)];
    if (typeof text !== 'string' || !text) {
      throw new Error(`Local CUV passage ${passageId} is unavailable`);
    }
    verses.push(text);
  }
  return {
    id: passageId,
    reference: `${data.book ?? book} ${chapter}:${first === last ? first : `${first}-${last}`}`,
    content: verses.join(''),
  };
}

function translationPayload(translation, metadata) {
  return {
    key: translation.key,
    label: translation.label,
    id: metadata.id ?? translation.bibleId,
    abbreviation: metadata.abbreviation ?? translation.label,
    title: metadata.title ?? translation.label,
    copyright: metadata.copyright ?? '',
    promotionalContent: metadata.promotional_content ?? '',
    youVersionDeepLink:
      metadata.youversion_deep_link ??
      `https://www.bible.com/versions/${translation.bibleId}`,
  };
}

export async function getTranslationMetadata(env, translationKey) {
  assertConfigured(env);
  const translation = requireTranslation(translationKey);
  const metadata = await getBibleMetadata(env, translation);
  return {
    translation: translationPayload(translation, metadata.value),
    cache: metadata.cache,
  };
}

export async function getTranslationPassage(env, translationKey, passageId) {
  assertConfigured(env);
  const translation = requireTranslation(translationKey);
  const validPassageId = requirePassageId(passageId);
  const cacheKey = `passage:${translation.bibleId}:${validPassageId}`;
  const cached = await env.DAILY_VERSE_KV.get(cacheKey, 'json');
  if (cached) return { ...cached, cache: 'HIT' };

  const [passage, versionResult] = await Promise.all([
    translation.local
      ? getLocalCuvPassage(env, validPassageId)
      : youVersionJson(
          `/bibles/${translation.bibleId}/passages/${encodeURIComponent(validPassageId)}?format=text&include_headings=false&include_notes=false`,
          env.YVP_APP_KEY,
        ),
    getBibleMetadata(env, translation),
  ]);

  if (!passage?.content || !passage?.reference) {
    throw new Error('YouVersion returned an incomplete passage');
  }

  const result = {
    passageId: passage.id ?? validPassageId,
    reference: passage.reference,
    text: passage.content.trim(),
    translation: translationPayload(translation, versionResult.value),
  };

  await env.DAILY_VERSE_KV.put(cacheKey, JSON.stringify(result), {
    expirationTtl: PASSAGE_TTL_SECONDS,
  });

  return { ...result, cache: 'MISS' };
}

async function getDailySelection(env, now) {
  const { date, dayOfYear } = dateInfo(now);
  const cacheKey = `daily-selection:${date}`;
  const cached = await env.DAILY_VERSE_KV.get(cacheKey, 'json');
  if (cached) return { ...cached, cache: 'HIT' };

  const selection = await youVersionJson(
    `/verse_of_the_days/${dayOfYear}`,
    env.YVP_APP_KEY,
  );
  if (!selection?.passage_id) {
    throw new Error('YouVersion returned no passage for today');
  }

  const dailySelection = {
    date,
    dayOfYear,
    passageId: requirePassageId(selection.passage_id),
  };
  await env.DAILY_VERSE_KV.put(cacheKey, JSON.stringify(dailySelection), {
    expirationTtl: DAILY_TTL_SECONDS,
  });
  return { ...dailySelection, cache: 'MISS' };
}

export async function getDailyVerse(env, translationKey = 'WEB', now = new Date()) {
  assertConfigured(env);
  const selection = await getDailySelection(env, now);
  const passage = await getTranslationPassage(
    env,
    translationKey,
    selection.passageId,
  );

  return {
    date: selection.date,
    dayOfYear: selection.dayOfYear,
    passageId: passage.passageId,
    reference: passage.reference,
    text: passage.text,
    translation: passage.translation,
    cache:
      selection.cache === 'HIT' && passage.cache === 'HIT' ? 'HIT' : 'MISS',
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/daily-verse') {
      if (request.method !== 'GET') {
        return json(
          { error: 'method_not_allowed' },
          { status: 405, headers: { Allow: 'GET' } },
        );
      }

      try {
        const translation = url.searchParams.get('translation') ?? 'WEB';
        const daily = await getDailyVerse(env, translation);
        return json(daily, {
          headers: {
            'Cache-Control': 'private, max-age=300',
            'X-Daily-Verse-Cache': daily.cache,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const unavailable =
          message.includes('is not configured');
        const invalid = message.includes('Unsupported Bible translation');
        if (!invalid) console.error('daily-verse', error);
        return json(
          {
            error: invalid ? 'invalid_translation' : 'daily_verse_unavailable',
            message: invalid
              ? 'That Bible translation is not supported.'
              : unavailable
                ? 'Daily Verse is not configured yet.'
                : 'Today’s verse could not be loaded. Please try again.',
          },
          { status: invalid ? 400 : unavailable ? 503 : 502 },
        );
      }
    }

    if (url.pathname === '/api/passage') {
      if (request.method !== 'GET') {
        return json(
          { error: 'method_not_allowed' },
          { status: 405, headers: { Allow: 'GET' } },
        );
      }

      try {
        const translation = url.searchParams.get('translation') ?? 'WEB';
        const passageId = url.searchParams.get('passage') ?? '';
        const passage = await getTranslationPassage(
          env,
          translation,
          passageId,
        );
        return json(passage, {
          headers: {
            'Cache-Control': 'private, max-age=300',
            'X-Bible-Passage-Cache': passage.cache,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const unavailable = message.includes('is not configured');
        const invalid =
          message.includes('Unsupported Bible translation') ||
          message.includes('Invalid YouVersion passage id');
        if (!invalid) console.error('bible-passage', error);
        return json(
          {
            error: invalid ? 'invalid_passage_request' : 'passage_unavailable',
            message: invalid
              ? 'That Bible passage request is not supported.'
              : unavailable
                ? 'Bible translations are not configured yet.'
                : 'That passage could not be loaded. Please try again.',
          },
          { status: invalid ? 400 : unavailable ? 503 : 502 },
        );
      }
    }

    if (url.pathname === '/api/translation') {
      if (request.method !== 'GET') {
        return json(
          { error: 'method_not_allowed' },
          { status: 405, headers: { Allow: 'GET' } },
        );
      }

      try {
        const translation = url.searchParams.get('translation') ?? 'WEB';
        const metadata = await getTranslationMetadata(env, translation);
        return json(metadata, {
          headers: {
            'Cache-Control': 'private, max-age=300',
            'X-Bible-Metadata-Cache': metadata.cache,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const unavailable = message.includes('is not configured');
        const invalid = message.includes('Unsupported Bible translation');
        if (!invalid) console.error('bible-translation', error);
        return json(
          {
            error: invalid ? 'invalid_translation' : 'translation_unavailable',
            message: invalid
              ? 'That Bible translation is not supported.'
              : unavailable
                ? 'Bible translations are not configured yet.'
                : 'That Bible translation could not be loaded.',
          },
          { status: invalid ? 400 : unavailable ? 503 : 502 },
        );
      }
    }

    return env.ASSETS.fetch(request);
  },
};
