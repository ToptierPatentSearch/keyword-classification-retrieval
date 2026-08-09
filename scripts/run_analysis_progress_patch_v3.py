from pathlib import Path

script_path = Path(__file__).with_name("apply_analysis_progress_patch.py")
source = script_path.read_text(encoding="utf-8")

original_helper = '''def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Could not find patch target: {label}")
    return text.replace(old, new, 1)
'''

replacement_helper = '''def replace_once(text: str, old: str, new: str, label: str) -> str:
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

if original_helper not in source:
    raise RuntimeError("Could not update the temporary patch helper.")
source = source.replace(original_helper, replacement_helper, 1)

original_effect = '''          useEffect(() => {
            const userId = session?.user.id;

            if (!loading || !userId || !activeAnalysisRequestId) {
              return;
            }

            let cancelled = false;
            let timerId: number | null = null;

            async function pollAnalysisProgress() {
              const rows = await fetchAnalysisProgress(
                userId,
                activeAnalysisRequestId,
              );
'''

replacement_effect = '''          useEffect(() => {
            const userId = session?.user.id;
            const requestId = activeAnalysisRequestId;

            if (!loading || !userId || !requestId) {
              return;
            }

            const progressUserId: string = userId;
            const progressRequestId: string = requestId;
            let cancelled = false;
            let timerId: number | null = null;

            async function pollAnalysisProgress() {
              const rows = await fetchAnalysisProgress(
                progressUserId,
                progressRequestId,
              );
'''

if original_effect not in source:
    raise RuntimeError("Could not update request-ID narrowing in the patch.")
source = source.replace(original_effect, replacement_effect, 1)

exec(
    compile(source, str(script_path), "exec"),
    {"__name__": "__main__", "__file__": str(script_path)},
)
