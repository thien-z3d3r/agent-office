import React, { useMemo } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Code } from "@astryxdesign/core/Code";
import { Divider } from "@astryxdesign/core/Divider";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { ShieldAlert } from "lucide-react";
import { useOfficeStore } from "../store/office-store.ts";

export const ApprovalDock: React.FC = React.memo(() => {
  const approvals = useOfficeStore((s) => s.snapshot.approvals);
  const resolveApproval = useOfficeStore((s) => s.resolveApproval);

  const approvalsList = useMemo(() => Object.values(approvals), [approvals]);
  if (approvalsList.length === 0) return null;

  return (
    <section
      className="hud-surface hud-approval-dock"
      aria-label="Director approval requests"
    >
      <VStack gap={3}>
        <HStack gap={2} vAlign="center" hAlign="between">
          <HStack gap={2} vAlign="center">
            <Icon icon={ShieldAlert} size="sm" color="error" />
            <Heading level={3}>Director Approval Required</Heading>
          </HStack>
          <Badge variant="error" label={`${approvalsList.length} pending`} />
        </HStack>

        {approvalsList.map((req, idx) => (
          <React.Fragment key={req.reqId}>
            {idx > 0 && <Divider />}
            <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
              <StackItem size="fill">
                <VStack gap={1}>
                  <HStack gap={1.5} vAlign="center" wrap="wrap">
                    <Text weight="semibold">
                      {req.agentId.toUpperCase()}
                    </Text>
                    <Text type="supporting">
                      {req.ticketId} · {req.kind}
                    </Text>
                    <Badge
                      variant={req.risk === "high" ? "error" : "warning"}
                      label={`${req.risk.toUpperCase()} RISK`}
                    />
                  </HStack>
                  <div>
                    <Code>{req.action}</Code>
                  </div>
                  <Text type="supporting">{req.reason}</Text>
                </VStack>
              </StackItem>

              <HStack gap={1.5} vAlign="center">
                <Button
                  size="sm"
                  variant="destructive"
                  label="Deny"
                  onClick={() => void resolveApproval(req.reqId, false)}
                />
                <Button
                  size="sm"
                  variant="primary"
                  label="Approve"
                  onClick={() => void resolveApproval(req.reqId, true)}
                />
              </HStack>
            </HStack>
          </React.Fragment>
        ))}
      </VStack>
    </section>
  );
});

ApprovalDock.displayName = "ApprovalDock";
