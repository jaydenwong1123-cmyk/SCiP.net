"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { armOmegaAction, fireOmegaAction, abortOmegaAction } from "./actions";
import type { OmegaState } from "./actions";

type Armed = { op: string; readyAt: number; expiresAt: number } | null;

// The three credential fields, repeated for arming and again for firing. They
// are deliberately not carried between the two steps: the server re-verifies on
// fire, so the client has nothing worth holding on to.
function Credentials({ prefix }: { prefix: string }) {
  return (
    <div className="space-y-2">
      <div>
        <label className="block text-sm mb-1" htmlFor={`${prefix}-password`}>
          ACCOUNT PASSWORD
        </label>
        <input
          id={`${prefix}-password`}
          name="password"
          type="password"
          required
          autoComplete="off"
          className="term-input"
        />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor={`${prefix}-key`}>
          OMEGA KEY
        </label>
        <input
          id={`${prefix}-key`}
          name="omegaKey"
          type="password"
          required
          autoComplete="off"
          className="term-input"
        />
      </div>
    </div>
  );
}

// Counts down to `readyAt`, then to `expiresAt`, refreshing the server view
// when the arming lapses so a stale panel cannot keep offering a dead button.
function ArmClock({
  readyAt,
  expiresAt,
  onReady,
}: {
  readyAt: number;
  expiresAt: number;
  onReady: (ready: boolean) => void;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      onReady(t >= readyAt && t <= expiresAt);
      if (t > expiresAt) router.refresh();
    }, 250);
    return () => clearInterval(id);
  }, [readyAt, expiresAt, onReady, router]);

  const untilReady = Math.max(0, Math.ceil((readyAt - now) / 1000));
  const untilExpiry = Math.max(0, Math.ceil((expiresAt - now) / 1000));

  return (
    <div className="hud-readout">
      <span className="hud-readout__label">
        {untilReady > 0 ? "HOLD" : "WINDOW CLOSES IN"}
      </span>
      <span
        className="hud-readout__value tabular-nums"
        style={{ color: "var(--term-red)" }}
      >
        {untilReady > 0 ? `${untilReady}s` : `${untilExpiry}s`}
      </span>
    </div>
  );
}

export function OmegaConsole({
  op,
  label,
  phrase,
  blurb,
  irreversible,
  armed,
}: {
  op: string;
  label: string;
  phrase: string;
  blurb: string;
  irreversible: boolean;
  armed: Armed;
}) {
  const [armState, armAction, arming] = useActionState<OmegaState, FormData>(
    armOmegaAction,
    null
  );
  const [fireState, fireAction, firing] = useActionState<OmegaState, FormData>(
    fireOmegaAction,
    null
  );
  const [ready, setReady] = useState(false);

  return (
    <div className="space-y-3">
      <p className="text-sm">{blurb}</p>
      {irreversible && (
        <p className="text-sm text-[var(--term-red)]">
          THIS OPERATION CANNOT BE UNDONE. NO BACKUP EXISTS.
        </p>
      )}

      {!(armed && armed.op === op) ? (
        <form action={armAction} className="space-y-3">
          <input type="hidden" name="op" value={op} />
          <Credentials prefix={op} />
          <div>
            <label className="block text-sm mb-1" htmlFor={`${op}-phrase`}>
              TYPE <span className="text-[var(--term-amber)]">{phrase}</span>
            </label>
            <input
              id={`${op}-phrase`}
              name="phrase"
              required
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="term-input"
            />
          </div>
          {armState?.error && (
            <p className="text-[var(--term-red)] text-sm">{armState.error}</p>
          )}
          <button
            type="submit"
            disabled={arming}
            className="term-button term-button--danger w-full"
          >
            {arming ? "VERIFYING..." : `ARM ${label}`}
          </button>
        </form>
      ) : (
        <div className="space-y-3">
          <ArmClock
            readyAt={armed.readyAt}
            expiresAt={armed.expiresAt}
            onReady={setReady}
          />
          <form
            action={fireAction}
            onSubmit={(e) => {
              if (
                !confirm(
                  `${label}: this is the final confirmation.${
                    irreversible ? " THIS CANNOT BE UNDONE." : ""
                  } Proceed?`
                )
              ) {
                e.preventDefault();
              }
            }}
            className="space-y-3"
          >
            <input type="hidden" name="op" value={op} />
            <Credentials prefix={`${op}-fire`} />
            <div>
              <label className="block text-sm mb-1" htmlFor={`${op}-fire-phrase`}>
                RE-TYPE <span className="text-[var(--term-amber)]">{phrase}</span>
              </label>
              <input
                id={`${op}-fire-phrase`}
                name="phrase"
                required
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="term-input"
              />
            </div>
            {/* Collected here rather than at arming time, because this is the
                request that writes it. */}
            {op === "terminate" && (
              <div>
                <label
                  className="block text-sm mb-1"
                  htmlFor={`${op}-shutdownMessage`}
                >
                  NOTICE SHOWN TO PERSONNEL (OPTIONAL)
                </label>
                <input
                  id={`${op}-shutdownMessage`}
                  name="shutdownMessage"
                  maxLength={300}
                  className="term-input"
                />
              </div>
            )}
            {fireState?.error && (
              <p className="text-[var(--term-red)] text-sm">{fireState.error}</p>
            )}
            {fireState?.message && (
              <p className="text-[var(--term-amber)] text-sm">
                {fireState.message}
              </p>
            )}
            <button
              type="submit"
              disabled={firing || !ready}
              className="term-button term-button--danger w-full"
            >
              {firing
                ? "EXECUTING..."
                : ready
                  ? `EXECUTE ${label}`
                  : "HOLD — DELAY IN PROGRESS"}
            </button>
          </form>
          <form action={abortOmegaAction}>
            <button type="submit" className="term-button w-full">
              ABORT
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
