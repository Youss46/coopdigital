interface TableSkeletonProps {
  colonnes: number;
  lignes?: number;
}

export function TableSkeleton({ colonnes, lignes = 6 }: TableSkeletonProps) {
  return (
    <>
      {Array.from({ length: lignes }).map((_, ligne) => (
        <tr key={ligne} className="border-b motion-reduce:animate-none">
          {Array.from({ length: colonnes }).map((_, col) => (
            <td key={col} className="p-2">
              <div
                className="h-4 rounded bg-gray-200 animate-pulse"
                style={{
                  width: col === 0 ? "70%" : `${55 + ((ligne * 13 + col * 7) % 35)}%`,
                  animationDelay: `${(ligne * colonnes + col) * 40}ms`,
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
