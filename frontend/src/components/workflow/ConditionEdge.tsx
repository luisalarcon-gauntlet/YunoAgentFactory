import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";
import { cn } from "@/lib/utils";

export interface ConditionEdgeData {
  condition?: string;
  label?: string;
  [key: string]: unknown;
}

export type ConditionEdgeType = Edge<ConditionEdgeData, "conditionEdge">;

const conditionColors: Record<string, { stroke: string; bg: string; text: string }> = {
  always: { stroke: "hsl(220, 70%, 50%)", bg: "bg-primary/15", text: "text-primary" },
  approved: { stroke: "hsl(142, 71%, 45%)", bg: "bg-emerald-500/15", text: "text-emerald-400" },
  rejected: { stroke: "hsl(0, 84%, 60%)", bg: "bg-red-500/15", text: "text-red-400" },
};

const defaultConditionStyle = {
  stroke: "hsl(220, 70%, 50%)",
  bg: "bg-primary/15",
  text: "text-primary",
};

function ConditionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps<ConditionEdgeType>) {
  const condition = data?.condition ?? "always";
  const label = data?.label || condition;
  const colors = conditionColors[condition] ?? defaultConditionStyle;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 16,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: colors.stroke,
          strokeWidth: selected ? 3 : 2,
          filter: selected ? `drop-shadow(0 0 4px ${colors.stroke})` : undefined,
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "absolute text-[10px] font-medium px-2 py-0.5 rounded-full border border-border/50 pointer-events-all nodrag nopan select-none",
              colors.bg,
              colors.text
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(ConditionEdge);
