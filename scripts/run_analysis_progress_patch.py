from pathlib import Path

script_path = Path(__file__).with_name("apply_analysis_progress_patch.py")
source = script_path.read_text(encoding="utf-8")

original = '''def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Could not find patch target: {label}")
    return text.replace(old, new, 1)
'''

replacement = '''def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if label == "loading progress card":
            start_marker = '      {loading && (\\n        <p className="status-card">'
            end_marker = '      {result && ('
            start = text.find(start_marker)
            end = text.find(end_marker, start)

            if start >= 0 and end > start:
                indented_new = "\\n".join(
                    f"      {line}" if line else line
                    for line in new.rstrip().splitlines()
                )
                return text[:start] + indented_new + "\\n" + text[end:]

        raise RuntimeError(f"Could not find patch target: {label}")
    return text.replace(old, new, 1)
'''

if original not in source:
    raise RuntimeError("Could not update the temporary patch helper.")

source = source.replace(original, replacement, 1)
exec(
    compile(source, str(script_path), "exec"),
    {"__name__": "__main__", "__file__": str(script_path)},
)
