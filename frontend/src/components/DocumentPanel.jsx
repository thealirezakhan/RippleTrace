import { useState, useRef } from "react";
import { Upload, FileText, Loader2, AlertCircle, CheckCircle } from "lucide-react";

export default function DocumentPanel({ documents, setDocuments, onGraphBuilt }) {
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(null);
  const [status, setStatus] = useState(null);
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setStatus(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/documents/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
      const data = await res.json();
      setDocuments((prev) => [...prev, { id: data.document_id, filename: data.filename }]);
      setStatus({ type: "ok", msg: `Uploaded ${file.name} (${data.chunks} chunks)` });
    } catch (err) {
      setStatus({ type: "error", msg: err.message });
    }

    setUploading(false);
    e.target.value = "";
  };

  const handleExtractAndBuild = async (docId) => {
    setExtracting(docId);
    setStatus(null);

    try {
      setStatus({ type: "ok", msg: "Extracting policy states..." });
      const extRes = await fetch(`/api/extraction/extract/${docId}`, { method: "POST" });
      if (!extRes.ok) throw new Error(`Extraction failed: ${await extRes.text()}`);
      const extData = await extRes.json();
      setStatus({ type: "ok", msg: `Extracted ${extData.extracted} elements. Building graph...` });

      const graphRes = await fetch(`/api/graph/build/${docId}`, { method: "POST" });
      if (!graphRes.ok) throw new Error(`Graph build failed: ${await graphRes.text()}`);
      const graph = await graphRes.json();
      setStatus({ type: "ok", msg: `Graph: ${graph.nodes_created} nodes, ${graph.edges_created} edges` });

      const nodesRes = await fetch("/api/graph/nodes");
      const edgesRes = await fetch("/api/graph/edges");
      const nodes = await nodesRes.json();
      const edges = await edgesRes.json();
      onGraphBuilt({ nodes, edges });
    } catch (err) {
      setStatus({ type: "error", msg: err.message });
    }

    setExtracting(null);
  };

  return (
    <div className="p-4 border-b border-gray-200">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Documents</h2>
      <input ref={fileRef} type="file" accept=".pdf,.md,.txt" className="hidden" onChange={handleUpload} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-50"
      >
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {uploading ? "Uploading..." : "Upload Document"}
      </button>

      {status && (
        <div className={`mt-2 flex items-start gap-2 text-xs px-3 py-2 rounded-lg ${status.type === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
          {status.type === "error" ? <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" /> : <CheckCircle className="w-3 h-3 mt-0.5 shrink-0" />}
          <span className="break-all">{status.msg}</span>
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {documents.map((doc) => (
          <li key={doc.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm">
            <span className="flex items-center gap-2 text-gray-700 truncate">
              <FileText className="w-4 h-4 text-gray-400 shrink-0" />
              {doc.filename}
            </span>
            <button
              onClick={() => handleExtractAndBuild(doc.id)}
              disabled={extracting === doc.id}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium whitespace-nowrap"
            >
              {extracting === doc.id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "Build Graph"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
