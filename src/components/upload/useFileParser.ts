import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
}

/** Lê CSV ou XLSX no browser e devolve cabeçalhos + linhas como objetos. */
export async function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "csv" || file.type === "text/csv") {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
        complete: (res) => {
          const headers = res.meta.fields ?? [];
          resolve({ headers, rows: res.data });
        },
        error: reject,
      });
    });
  }

  // XLSX / XLS
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "", raw: false });
  const headers = json.length ? Object.keys(json[0]) : [];
  return { headers, rows: json };
}
