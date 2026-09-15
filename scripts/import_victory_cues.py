"""Import the owner's approved stem mixes; fade only the accompaniment."""
import json
import subprocess
from pathlib import Path
import numpy as np
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / 'output/victory-stems-review/review'
OUT = ROOT / 'public/audio/victory'
KEEP = {1,2,3,4,6,9,10,11,12,14,18,19,20,21,23,24,27,28,30}
OUT.mkdir(parents=True, exist_ok=True)
manifest = []
for clip in json.loads((SOURCE / 'manifest.json').read_text()):
    if clip['id'] not in KEEP:
        continue
    sr, raw = wavfile.read(SOURCE / Path(clip['file']).with_suffix('.wav'))
    vsr, solo = wavfile.read(SOURCE / Path(clip['solo']).with_suffix('.wav'))
    assert sr == vsr and raw.shape == solo.shape and clip['output_gain'] == 1
    voice = solo.astype(np.float32) / 32768
    bed = (raw.astype(np.float32) - solo.astype(np.float32)) / 32768
    # Original mix has a 650 ms fade. Extend its envelope to 900 ms;
    # retain the reviewed vocal stem at exactly its original half-volume.
    n = int(.9 * sr)
    bed[-n:] *= np.linspace(1, 0, n)[:, None]
    mix = bed + voice
    assert 3 <= len(mix)/sr <= 5 and np.max(np.abs(mix)) < 1
    assert np.sqrt(np.mean(mix**2)) > .005
    assert np.max(np.abs(mix[-int(.01*sr):])) < .005
    dest = OUT / clip['file']
    subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(sr),'-ac','2',
                    '-i','pipe:0','-map_metadata','-1','-c:a','libmp3lame','-b:a','192k',str(dest)],
                   input=mix.astype('<f4').tobytes(), check=True)
    decoded = subprocess.run(['ffmpeg','-v','error','-i',str(dest),'-f','f32le','-'],
                             capture_output=True,check=True)
    samples = np.frombuffer(decoded.stdout,dtype='<f4')
    assert len(samples) > sr*3*2 and np.sqrt(np.mean(samples**2)) > .005
    manifest.append({k:clip[k] for k in ('id','label','file','duration','vocal_gain')} | {'accompaniment_fade_seconds':.9})
(OUT / 'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Exported and decoded {len(manifest)} selected clips; vocals 50%, bed fades 900ms.')
