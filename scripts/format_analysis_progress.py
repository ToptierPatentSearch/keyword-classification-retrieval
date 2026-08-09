from pathlib import Path

app_path = Path(__file__).resolve().parents[1] / "app/src/App.tsx"
text = app_path.read_text(encoding="utf-8")

text = text.replace(
    "    return () => {\n      cancelled = true;\n    };\n}, [session?.user.id, creditRefreshKey]);",
    "    return () => {\n      cancelled = true;\n    };\n  }, [session?.user.id, creditRefreshKey]);",
    1,
)

start_marker = "\nuseEffect(() => {\n  const userId = session?.user.id;"
end_marker = "\n}, [loading, session?.user.id, activeAnalysisRequestId]);"
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise RuntimeError("Could not locate the progress polling effect.")
end += len(end_marker)
block = text[start + 1 : end]
indented_block = "\n".join(f"  {line}" if line else line for line in block.splitlines())
text = text[: start + 1] + indented_block + text[end:]

text = text.replace(
    "\nconst sortedKeywords = useMemo(\n\n    () =>",
    "\n  const sortedKeywords = useMemo(\n    () =>",
    1,
)

start_marker = "\npendingAnalyzeRequestRef.current = pendingRequest;"
end_marker = "\nconst { data, error: functionError } = await supabase.functions.invoke<"
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise RuntimeError("Could not locate request progress initialization.")
end += len(end_marker)
block = text[start + 1 : end]
indented_block = "\n".join(f"      {line}" if line else line for line in block.splitlines())
text = text[: start + 1] + indented_block + text[end:]
text = text.replace(
    "await supabase.functions.invoke<\n\n        AnalysisResult",
    "await supabase.functions.invoke<\n        AnalysisResult",
    1,
)

start_marker = "\nconst finalProgress = await fetchAnalysisProgress("
end_marker = "\npendingAnalyzeRequestRef.current = null;"
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise RuntimeError("Could not locate final progress refresh.")
end += len(end_marker)
block = text[start + 1 : end]
indented_block = "\n".join(f"      {line}" if line else line for line in block.splitlines())
text = text[: start + 1] + indented_block + text[end:]

for unexpected in (
    "\nuseEffect(() => {\n  const userId = session?.user.id;",
    "\npendingAnalyzeRequestRef.current = pendingRequest;",
    "\nconst finalProgress = await fetchAnalysisProgress(",
    "\nconst sortedKeywords = useMemo(",
):
    if unexpected in text:
        raise RuntimeError(f"Formatting cleanup left an unindented block: {unexpected!r}")

app_path.write_text(text, encoding="utf-8")
print("Analysis progress integration formatting normalized.")
