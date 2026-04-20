import { Dataset } from "@/lib/types";
import { getImportedModelName, getImportedProvider } from "@/lib/dataset-upload";

export function DatasetTable({ datasets }: { datasets: Dataset[] }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-black/5 bg-white/80 shadow-panel">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-ink text-white">
          <tr>
            <th className="px-4 py-3 font-medium">Dataset</th>
            <th className="px-4 py-3 font-medium">Rows</th>
            <th className="px-4 py-3 font-medium">Imported Outputs</th>
            <th className="px-4 py-3 font-medium">Providers / Models</th>
            <th className="px-4 py-3 font-medium">Schema</th>
            <th className="px-4 py-3 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {datasets.map((dataset) => {
            const importedRows = dataset.imported_output_count ?? dataset.rows?.filter((row) => row.model_output).length ?? 0;
            const providers = new Set((dataset.rows || []).map((row) => getImportedProvider(row)).filter(Boolean));
            const models = new Set((dataset.rows || []).map((row) => getImportedModelName(row)).filter(Boolean));
            return (
              <tr key={dataset.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-slate-900">{dataset.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {importedRows ? "Imported-run ready" : "Prompt-generated dataset"}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-3">{dataset.row_count ?? dataset.rows?.length ?? 0}</td>
                <td className="px-4 py-3">{importedRows}</td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {typeof dataset.provider_count === "number" || typeof dataset.model_count === "number"
                    ? `${dataset.provider_count ?? 0} providers / ${dataset.model_count ?? 0} models`
                    : providers.size || models.size
                      ? `${providers.size} providers / ${models.size} models`
                      : "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{JSON.stringify(dataset.schema)}</td>
                <td className="px-4 py-3">{new Date(dataset.created_at).toLocaleDateString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
