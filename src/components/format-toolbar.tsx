"use client";

import { type RefObject } from "react";

// Wraps the current textarea selection in a markup pair. With nothing
// selected, inserts the pair and drops the caret between the markers so the
// author can just keep typing.
function wrap(
  el: HTMLTextAreaElement,
  before: string,
  after: string,
  onChange?: (value: string) => void
) {
  const { selectionStart: start, selectionEnd: end, value } = el;
  const selected = value.slice(start, end);
  const next = value.slice(0, start) + before + selected + after + value.slice(end);

  el.value = next;
  el.focus();
  el.setSelectionRange(start + before.length, start + before.length + selected.length);

  if (onChange) {
    onChange(next);
  } else {
    // Uncontrolled textareas (plain defaultValue forms) still need React and
    // the form to observe the change, which a direct .value write skips.
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

export function FormatToolbar({
  targetRef,
  onChange,
}: {
  targetRef: RefObject<HTMLTextAreaElement | null>;
  onChange?: (value: string) => void;
}) {
  const apply = (before: string, after: string) => {
    const el = targetRef.current;
    if (el) wrap(el, before, after, onChange);
  };

  return (
    <div className="flex flex-wrap items-center gap-1 mb-1">
      <button
        type="button"
        onClick={() => apply("**", "**")}
        className="term-button px-2 py-0.5 text-xs font-bold"
        title="Bold the selected text"
      >
        B
      </button>
      <button
        type="button"
        onClick={() => apply("~~", "~~")}
        className="term-button px-2 py-0.5 text-xs line-through"
        title="Strike through the selected text"
      >
        S
      </button>
      <button
        type="button"
        onClick={() => apply("[center]", "[/center]")}
        className="term-button px-2 py-0.5 text-xs"
        title="Centre the selected text"
      >
        CENTRE
      </button>
      <span className="text-xs text-[var(--term-fg-dim)] ml-1">
        <code>**bold**</code> · <code>~~struck~~</code> ·{" "}
        <code>[center]…[/center]</code>
      </span>
    </div>
  );
}
