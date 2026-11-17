import React from "react";
import { Button, Text } from "figma-kit";

interface ScanActionProps {
  label: string;
  building: boolean;
  progress: { stage: string; scanned: number; total: number } | null;
  disabled?: boolean;
  onScan: () => void;
}

/**
 * The pinned primary button. Never waits on the estimate: clicking it while
 * the file is still being sized up abandons the estimate and starts the scan.
 */
export const ScanAction: React.FC<ScanActionProps> = ({ label, building, progress, disabled, onScan }) => (
  <>
    <Button variant="primary" onClick={onScan} disabled={building || disabled} style={{ width: "100%" }}>
      {building ? "Scanning…" : label}
    </Button>
    {building && progress && (
      <Text size="small" style={{ color: "var(--figma-color-text-secondary)" }}>
        {progress.stage}: {progress.scanned}/{progress.total}
      </Text>
    )}
  </>
);
