"""Build the Obsidian plugin into dist/ (main.js, styles.css, manifest.json). No dependencies: python3 build.py"""
import pathlib, shutil
R = pathlib.Path(__file__).resolve().parent; out = R / 'dist'; out.mkdir(exist_ok=True)
for f in ['main.js', 'styles.css']: shutil.copy(R / 'src' / f, out / f)
shutil.copy(R / 'manifest.json', out / 'manifest.json')
print('dist/ ready: main.js, manifest.json, styles.css')
