import { Dataset } from "@/lib/types";

export function DatasetTable({ datasets }: { datasets: Dataset[] }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-black/5 bg-white/80 shadow-panel">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-ink text-white">
          <tr>
            <th className="px-4 py-3 font-medium">Dataset</th>
            <th className="px-4 py-3 font-medium">Rows</th>
            <th className="px-4 py-3 font-medium">Imported Outputs</th>
            <th className="px-4 py-3 font-medium">Schema</th>
            <th className="px-4 py-3 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {datasets.map((dataset) => (
            <tr key={dataset.id} className="border-t border-slate-100">
              <td className="px-4 py-3">{dataset.name}</td>
              <td className="px-4 py-3">{dataset.rows.length}</td>
              <td className="px-4 py-3">{dataset.rows.filter((row) => row.model_output).length}</td>
              <td className="px-4 py-3 font-mono text-xs">{JSON.stringify(dataset.schema)}</td>
              <td className="px-4 py-3">{new Date(dataset.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
