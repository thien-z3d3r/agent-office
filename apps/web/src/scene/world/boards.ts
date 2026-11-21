import * as THREE from "three";
import type { ProviderId, TaskTableRow, Ticket } from "@agent-office/protocol";
import { mesh, noOutline, roundedBox, toon } from "../toon.ts";
import { FLOOR, MEETING_TABLE, PALETTE, type Disposable } from "./constants.ts";
import { addTextLabelToAtlas, type StaticSignAtlas } from "./static-atlas.ts";

export interface OfficeBoardsHandle {
  kanbanBoardCanvas: HTMLCanvasElement;
  kanbanBoardTexture: THREE.CanvasTexture;
  meetingBoardCanvas: HTMLCanvasElement;
  meetingBoardTexture: THREE.CanvasTexture;
  updateBoards: (
    tickets: Record<string, Ticket>,
    taskTable: Record<string, TaskTableRow>,
    activeProvider: ProviderId,
    standupText: string | null
  ) => void;
}

function paintSideBoard(
  canvas: HTMLCanvasElement,
  heading: string,
  lines: string[],
  bg: string
): void {
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#2b2d42";
  ctx.font = "900 44px Nunito, ui-rounded, sans-serif";
  ctx.fillText(heading, 36, 62);
  ctx.font = "700 30px Nunito, ui-rounded, sans-serif";
  lines.forEach((l, idx) => {
    ctx.fillStyle = "#fffaf3";
    ctx.beginPath();
    ctx.roundRect(32, 95 + idx * 105, canvas.width - 64, 88, 16);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#2b2d42";
    ctx.stroke();
    ctx.fillStyle = "#2b2d42";
    ctx.fillText(l, 54, 148 + idx * 105);
  });
}

function paintKanbanBoard(
  canvas: HTMLCanvasElement,
  activeProvider: ProviderId,
  taskRows: TaskTableRow[],
  tickets: Ticket[]
): void {
  const kCtx = canvas.getContext("2d")!;
  kCtx.fillStyle = "#fffaf3";
  kCtx.fillRect(0, 0, canvas.width, canvas.height);
  kCtx.fillStyle = "#2b2d42";
  kCtx.font = "900 38px Nunito, ui-rounded, sans-serif";
  kCtx.fillText(
    `Task Table (${activeProvider.toUpperCase()} -> ${taskRows.length} sub-agents)`,
    32,
    54
  );

  if (taskRows.length === 0 && tickets.length === 0) {
    kCtx.fillStyle = "#7a6f65";
    kCtx.font = "700 30px Nunito, ui-rounded, sans-serif";
    kCtx.fillText(
      "No active tasks. Click Dispatch Task in the top bar.",
      32,
      140
    );
  } else if (taskRows.length > 0) {
    taskRows.slice(0, 4).forEach((row, idx) => {
      const y = 84 + idx * 112;
      kCtx.fillStyle =
        row.status === "done"
          ? "#d8f5e3"
          : row.status === "failed"
            ? "#ffe3ea"
            : row.status === "running"
              ? "#ffec99"
              : "#fff1de";
      kCtx.beginPath();
      kCtx.roundRect(28, y, canvas.width - 56, 96, 16);
      kCtx.fill();
      kCtx.lineWidth = 4;
      kCtx.strokeStyle = "#2b2d42";
      kCtx.stroke();

      kCtx.fillStyle = "#2b2d42";
      kCtx.font = "900 26px Nunito, ui-rounded, sans-serif";
      kCtx.fillText(
        `#${row.order} [${row.role.toUpperCase()} · ${row.status.toUpperCase()}] ${row.title.slice(0, 32)}`,
        48,
        y + 40
      );
      kCtx.fillStyle = "#5c5346";
      kCtx.font = "700 22px Nunito, ui-rounded, sans-serif";
      kCtx.fillText(
        `Sub-Agent: ${row.subAgentId} · Target: ${row.artifactOrCmd.slice(0, 32)}`,
        48,
        y + 74
      );
    });
  } else {
    tickets.slice(0, 4).forEach((t, idx) => {
      const y = 84 + idx * 112;
      kCtx.fillStyle =
        t.stage === "Done"
          ? "#d8f5e3"
          : t.stage === "Escalated"
            ? "#ffe3ea"
            : "#fff1de";
      kCtx.beginPath();
      kCtx.roundRect(28, y, canvas.width - 56, 96, 16);
      kCtx.fill();
      kCtx.lineWidth = 4;
      kCtx.strokeStyle = "#2b2d42";
      kCtx.stroke();

      kCtx.fillStyle = "#2b2d42";
      kCtx.font = "900 28px Nunito, ui-rounded, sans-serif";
      kCtx.fillText(
        `${t.id} [${t.size} · ${t.stage}] ${t.title.slice(0, 34)}`,
        48,
        y + 40
      );
      kCtx.fillStyle = "#5c5346";
      kCtx.font = "700 23px Nunito, ui-rounded, sans-serif";
      kCtx.fillText(
        `Assignee: ${
          t.assignee ? t.assignee.toUpperCase() : "Done"
        } · Branch: ${t.branch ?? "main"} · $${t.spentUsd.toFixed(4)}`,
        48,
        y + 74
      );
    });
  }
}

function paintMeetingBoard(
  canvas: HTMLCanvasElement,
  standupText: string | null
): void {
  const mCtx = canvas.getContext("2d")!;
  mCtx.fillStyle = "#fffaf3";
  mCtx.fillRect(0, 0, canvas.width, canvas.height);
  mCtx.fillStyle = "#2b2d42";
  mCtx.font = "900 34px Nunito, ui-rounded, sans-serif";
  mCtx.fillText("Daily Standup & Handoffs", 28, 48);
  mCtx.font = "700 24px Nunito, ui-rounded, sans-serif";
  const lines = (
    standupText ??
    "Click Daily Standup in the top dock to gather all 8 agents around the meeting table."
  ).split("\n");
  lines.slice(0, 9).forEach((line, idx) => {
    mCtx.fillText(line.slice(0, 56), 28, 96 + idx * 34);
  });
}

export function buildOfficeBoards(
  root: THREE.Group,
  staticRoot: THREE.Group,
  atlas: StaticSignAtlas,
  disposables: Set<Disposable>
): OfficeBoardsHandle {
  const buildFramedBoard = (
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    frameHex: string
  ) => {
    const frame = mesh(
      roundedBox(w + 0.3, 0.12, h + 0.3, 0.1),
      toon(frameHex),
      x,
      y,
      FLOOR.minZ + 0.08
    );
    frame.rotation.x = Math.PI / 2;
    staticRoot.add(frame);

    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 560;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    mat.userData.outlineParameters = { visible: false };
    disposables.add(tex);
    disposables.add(geo);
    disposables.add(mat);

    const face = new THREE.Mesh(geo, mat);
    face.position.set(x, y, FLOOR.minZ + 0.08 + 0.07);
    root.add(noOutline(face));

    addTextLabelToAtlas(
      atlas,
      title,
      { bg: "#fffaf3", size: 58 },
      [x, y + h / 2 + 0.45, FLOOR.minZ + 0.08],
      0,
      1.1
    );
    return { canvas, tex };
  };

  const specsBoard = buildFramedBoard(
    -11.5,
    2.4,
    4.6,
    2.3,
    "Specs & Architecture",
    PALETTE.wood
  );
  const kanbanBoard = buildFramedBoard(
    -4.0,
    2.4,
    5.4,
    2.4,
    "Kanban Task Queue",
    "#aab4be"
  );
  const prBoard = buildFramedBoard(
    3.5,
    2.4,
    4.6,
    2.3,
    "Review & Shipped PRs",
    PALETTE.wood
  );

  paintSideBoard(
    specsBoard.canvas,
    "Single Provider -> 8 Sub-Agents",
    [
      "1 Provider drives the entire office",
      "Task Table spawns role sub-agents",
      "PM -> docs/specs/T-*.md · TL -> docs/adr/",
      "Isolated git worktrees in .worktrees/",
    ],
    "#e8c594"
  );
  specsBoard.tex.needsUpdate = true;

  const meetingBoardCanvas = document.createElement("canvas");
  meetingBoardCanvas.width = 768;
  meetingBoardCanvas.height = 420;
  const meetingBoardTexture = new THREE.CanvasTexture(meetingBoardCanvas);
  meetingBoardTexture.colorSpace = THREE.SRGBColorSpace;
  const mBoardGeo = new THREE.PlaneGeometry(2.6, 1.4);
  const mBoardMat = new THREE.MeshBasicMaterial({ map: meetingBoardTexture });
  disposables.add(meetingBoardTexture);
  disposables.add(mBoardGeo);
  disposables.add(mBoardMat);

  const mBoardFace = new THREE.Mesh(mBoardGeo, mBoardMat);
  mBoardFace.position.set(MEETING_TABLE.x, 1.65, FLOOR.maxZ - 0.12);
  mBoardFace.rotation.y = Math.PI;
  root.add(noOutline(mBoardFace));

  let initialized = false;
  let prevTickets: Record<string, Ticket> | null = null;
  let prevTaskTable: Record<string, TaskTableRow> | null = null;
  let prevProvider: ProviderId | null = null;
  let prevStandup: string | null | undefined = undefined;
  let prevKanbanKey = "";
  let prevPrKey = "";

  const updateBoards = (
    tickets: Record<string, Ticket>,
    taskTable: Record<string, TaskTableRow>,
    activeProvider: ProviderId,
    standupText: string | null
  ) => {
    if (
      initialized &&
      tickets === prevTickets &&
      taskTable === prevTaskTable &&
      activeProvider === prevProvider &&
      standupText === prevStandup
    ) {
      return;
    }

    if (!initialized || activeProvider !== prevProvider) {
      paintSideBoard(
        specsBoard.canvas,
        `Provider: ${activeProvider.toUpperCase()}`,
        [
          `Active Engine: ${activeProvider} for all roles`,
          "Task Table spawns role sub-agents",
          "PM -> docs/specs/ · TL -> docs/adr/",
          "Isolated git worktrees in .worktrees/",
        ],
        "#e8c594"
      );
      specsBoard.tex.needsUpdate = true;
    }

    if (!initialized || standupText !== prevStandup) {
      paintMeetingBoard(meetingBoardCanvas, standupText);
      meetingBoardTexture.needsUpdate = true;
    }

    const ticketsChanged = !initialized || tickets !== prevTickets;
    const tasksChanged = !initialized || taskTable !== prevTaskTable;
    const providerChanged = !initialized || activeProvider !== prevProvider;

    if (tasksChanged || ticketsChanged || providerChanged) {
      const taskRows = Object.values(taskTable).sort((a, b) => a.order - b.order);
      const list =
        ticketsChanged || taskRows.length === 0
          ? Object.values(tickets).sort((a, b) => b.updatedAt - a.updatedAt)
          : null;

      const kanbanKey =
        taskRows.length > 0
          ? `${activeProvider}|R${taskRows.length}|` +
            taskRows
              .slice(0, 4)
              .map(
                (r) =>
                  `${r.order}:${r.role}:${r.status}:${r.title.slice(0, 32)}:${r.subAgentId}:${r.artifactOrCmd.slice(0, 32)}`
              )
              .join("|")
          : `${activeProvider}|T|` +
            (list ?? [])
              .slice(0, 4)
              .map(
                (t) =>
                  `${t.id}:${t.size}:${t.stage}:${t.title.slice(0, 34)}:${t.assignee ?? ""}:${t.branch ?? ""}:${t.spentUsd.toFixed(4)}`
              )
              .join("|");

      if (!initialized || kanbanKey !== prevKanbanKey) {
        prevKanbanKey = kanbanKey;
        paintKanbanBoard(kanbanBoard.canvas, activeProvider, taskRows, list ?? []);
        kanbanBoard.tex.needsUpdate = true;
      }

      if (ticketsChanged && list) {
        const doneTickets = list.filter(
          (t) =>
            t.stage === "Done" || t.stage === "Review" || t.stage === "ReadyToMerge"
        );
        const prKey =
          `${doneTickets.length}|` +
          doneTickets
            .slice(0, 4)
            .map(
              (t) =>
                `${t.id}:${t.stage}:${t.branch ?? "main"}:${t.title.slice(0, 24)}`
            )
            .join("|");

        if (!initialized || prKey !== prevPrKey) {
          prevPrKey = prKey;
          paintSideBoard(
            prBoard.canvas,
            `Reviews & Shipped (${doneTickets.length})`,
            doneTickets.length
              ? doneTickets
                  .slice(0, 4)
                  .map(
                    (t) =>
                      `${t.id} (${t.stage}): ${t.branch ?? "main"} · ${t.title.slice(
                        0,
                        24
                      )}`
                  )
              : [
                  "Cross-vendor review rule active",
                  "Reviewer never shares author vendor",
                  "Director approval required for main merge",
                ],
            "#d8a86a"
          );
          prBoard.tex.needsUpdate = true;
        }
      }
    }

    initialized = true;
    prevTickets = tickets;
    prevTaskTable = taskTable;
    prevProvider = activeProvider;
    prevStandup = standupText;
  };

  return {
    kanbanBoardCanvas: kanbanBoard.canvas,
    kanbanBoardTexture: kanbanBoard.tex,
    meetingBoardCanvas,
    meetingBoardTexture,
    updateBoards,
  };
}
