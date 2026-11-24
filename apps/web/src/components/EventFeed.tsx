import React, { useMemo, useState } from "react";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { HStack } from "@astryxdesign/core/HStack";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import { useOfficeStore } from "../store/office-store.ts";
import { formatEventLine } from "./format-event.ts";

export const EventFeed: React.FC = React.memo(() => {
  const recentEvents = useOfficeStore((s) => s.recentEvents);
  const [expanded, setExpanded] = useState(false);

  const visibleEvents = useMemo(
    () => recentEvents.slice(0, expanded ? 10 : 2),
    [recentEvents, expanded]
  );

  return (
    <footer
      id="office-events"
      tabIndex={-1}
      className="hud-bottom"
      aria-label="Recent office events"
    >
      <div className="hud-surface hud-activity">
        <div className="hud-activity-header">
          <HStack gap={1.5} vAlign="center">
            <Icon icon={Activity} size="xsm" color="accent" />
            <Text type="label" weight="semibold">
              Activity
            </Text>
            {recentEvents.length > 0 && (
              <Text type="supporting" hasTabularNumbers>
                {recentEvents.length}
              </Text>
            )}
          </HStack>

          <IconButton
            size="sm"
            variant="ghost"
            icon={<Icon icon={expanded ? ChevronDown : ChevronUp} size="xsm" />}
            label={expanded ? "Collapse activity log" : "Expand activity log"}
            tooltip={expanded ? "Show fewer events" : "Show more events"}
            onClick={() => setExpanded((v) => !v)}
          />
        </div>

        <ul className="hud-activity-list">
          {visibleEvents.length === 0 ? (
            <li className="hud-activity-item">
              <span className="hud-activity-bullet" aria-hidden="true" />
              <span>
                Office ready. Click any 3D worker to inspect their laptop
                terminal, or pet Biscuit the office corgi.
              </span>
            </li>
          ) : (
            visibleEvents.map((ev) => (
              <li key={ev.id} className="hud-activity-item">
                <span className="hud-activity-bullet" aria-hidden="true" />
                <span>{formatEventLine(ev)}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </footer>
  );
});

EventFeed.displayName = "EventFeed";
