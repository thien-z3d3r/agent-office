import React from "react";
import { useShallow } from "zustand/react/shallow";
import { useOfficeStore } from "../store/office-store.ts";
import { formatEventLine } from "./format-event.ts";

export const EventFeed: React.FC = () => {
  const topEvents = useOfficeStore(
    useShallow((s) => s.recentEvents.slice(0, 5))
  );

  return (
    <footer
      id="office-events"
      tabIndex={-1}
      className="bottom-bar"
      aria-label="Recent office events"
    >
      <div className="panel">
        <ul className="event-feed">
          {topEvents.length === 0 ? (
            <li>
              <span className="pill idle">Ready</span> Office ready. Click a 3D
              worker to open their laptop terminal or pet Biscuit the office
              corgi.
            </li>
          ) : (
            topEvents.map((ev) => <li key={ev.id}>{formatEventLine(ev)}</li>)
          )}
        </ul>
      </div>
    </footer>
  );
};
