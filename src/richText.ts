/**
 * Rich-text engine for WriteRight AI
 * 
 * A document is a flat array of StyledSegment objects.
 * Each segment is the smallest run of text that shares the same formatting.
 * Grammar correction replaces only the `text` property — style flags are untouched.
 */

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | null;

export interface StyledSegment {
  text:      string;
  bold:      boolean;
  italic:    boolean;
  underline: boolean;
  highlight: HighlightColor;
}

/** Canonical empty segment */
export const emptySegment = (): StyledSegment => ({
  text: '', bold: false, italic: false, underline: false, highlight: null,
});

/** Merge adjacent segments that have identical style fingerprints */
export function mergeSegments(segs: StyledSegment[]): StyledSegment[] {
  const out: StyledSegment[] = [];
  for (const seg of segs) {
    if (!seg.text) continue;
    const last = out[out.length - 1];
    if (
      last &&
      last.bold      === seg.bold &&
      last.italic    === seg.italic &&
      last.underline === seg.underline &&
      last.highlight === seg.highlight
    ) {
      last.text += seg.text;
    } else {
      out.push({ ...seg });
    }
  }
  return out.length ? out : [emptySegment()];
}

/** Plain text of the whole document */
export function toPlainText(segs: StyledSegment[]): string {
  return segs.map(s => s.text).join('');
}

/**
 * Render segments → HTML string for the contenteditable div.
 * Each segment becomes a <span> with appropriate classes.
 * Error spans are injected on top of existing style spans.
 */
export function segmentsToHtml(
  segs: StyledSegment[],
  issues: Array<{ orig: string; fix: string; cat: string; msg: string; offset: number }>,
): string {
  // Build a flat char array: [segIndex, charIndexInSeg]
  // Then inject error markers based on plain-text offsets
  const plain = toPlainText(segs);

  // Build a map: charOffset → { openTags, closeTags } for error spans
  const errorOpens: Record<number, string>  = {};
  const errorCloses: Record<number, string> = {};

  // Sort issues by offset ascending
  const sorted = [...issues].sort((a, b) => a.offset - b.offset);
  for (const iss of sorted) {
    if (iss.offset < 0 || iss.offset + iss.orig.length > plain.length) continue;
    const catClass = `err-word ${iss.cat}`;
    const safeMsg  = iss.msg.replace(/"/g, '&quot;');
    errorOpens[iss.offset]                    = (errorOpens[iss.offset]  || '') + `<span class="${catClass}" title="${safeMsg}">`;
    errorCloses[iss.offset + iss.orig.length] = (errorCloses[iss.offset + iss.orig.length] || '') + '</span>';
  }

  let html      = '';
  let charCursor = 0;

  for (const seg of segs) {
    if (!seg.text) continue;

    // Build opening tag for this segment's style
    const classes: string[] = ['rt-seg'];
    if (seg.bold)      classes.push('rt-bold');
    if (seg.italic)    classes.push('rt-italic');
    if (seg.underline) classes.push('rt-underline');
    if (seg.highlight) classes.push(`rt-hl-${seg.highlight}`);
    const dataAttrs = [
      `data-bold="${seg.bold}"`,
      `data-italic="${seg.italic}"`,
      `data-underline="${seg.underline}"`,
      `data-highlight="${seg.highlight ?? ''}"`,
    ].join(' ');

    html += `<span class="${classes.join(' ')}" ${dataAttrs}>`;

    // Walk each character in this segment
    for (let i = 0; i < seg.text.length; i++) {
      const pos = charCursor + i;
      if (errorOpens[pos])  html += errorOpens[pos];
      // Escape HTML special chars
      const ch = seg.text[i];
      html += ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch;
      if (errorCloses[pos + 1]) html += errorCloses[pos + 1];
    }

    html += '</span>';
    charCursor += seg.text.length;
  }

  return html;
}

/**
 * Parse the contenteditable DOM back into segments.
 * Reads data-bold/italic/underline/highlight attributes from .rt-seg spans.
 * Falls back to reading computed styles for text not inside a seg span.
 */
export function domToSegments(container: HTMLElement): StyledSegment[] {
  const segs: StyledSegment[] = [];

  function walk(node: Node, inheritStyle: Omit<StyledSegment, 'text'>) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent || '';
      if (t) segs.push({ text: t, ...inheritStyle });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;

    // Determine style from this element
    let style = { ...inheritStyle };

    if (el.classList.contains('rt-seg')) {
      style = {
        bold:      el.dataset.bold      === 'true',
        italic:    el.dataset.italic    === 'true',
        underline: el.dataset.underline === 'true',
        highlight: (el.dataset.highlight as HighlightColor) || null,
      };
    } else {
      // Handle legacy / browser-injected tags
      const tag = el.tagName;
      if (tag === 'B' || tag === 'STRONG') style.bold = true;
      if (tag === 'I' || tag === 'EM')     style.italic = true;
      if (tag === 'U')                      style.underline = true;
      if (tag === 'BR')                     { segs.push({ text: '\n', ...inheritStyle }); return; }
    }

    // Skip error-word spans — their content is already covered by the seg span
    if (el.classList.contains('err-word')) {
      for (const child of Array.from(el.childNodes)) walk(child, style);
      return;
    }

    for (const child of Array.from(el.childNodes)) walk(child, style);
  }

  const base: Omit<StyledSegment, 'text'> = {
    bold: false, italic: false, underline: false, highlight: null,
  };
  for (const child of Array.from(container.childNodes)) walk(child, base);

  return mergeSegments(segs);
}

/**
 * Apply a style toggle to a range [startOff, endOff) in the segment array.
 * Returns a new segment array.
 */
export function applyStyleToRange(
  segs: StyledSegment[],
  startOff: number,
  endOff: number,
  key: keyof Omit<StyledSegment, 'text'>,
  value: boolean | HighlightColor,
): StyledSegment[] {
  if (startOff >= endOff) return segs;

  const result: StyledSegment[] = [];
  let cursor = 0;

  for (const seg of segs) {
    const segStart = cursor;
    const segEnd   = cursor + seg.text.length;

    if (segEnd <= startOff || segStart >= endOff) {
      // Outside range — keep as-is
      result.push({ ...seg });
    } else {
      // Potentially split into up to 3 parts: before / inside / after
      if (segStart < startOff) {
        result.push({ ...seg, text: seg.text.slice(0, startOff - segStart) });
      }
      const inside: StyledSegment = {
        ...seg,
        text: seg.text.slice(Math.max(0, startOff - segStart), endOff - segStart),
        [key]: value,
      };
      result.push(inside);
      if (segEnd > endOff) {
        result.push({ ...seg, text: seg.text.slice(endOff - segStart) });
      }
    }
    cursor += seg.text.length;
  }

  return mergeSegments(result);
}

/**
 * Apply grammar corrections to segments.
 * Only touches text — styles are preserved.
 * 
 * Strategy: work on the plain-text string, build a mapping from old
 * char offsets to new char offsets after replacements, then
 * reconstruct the segment array with corrected text.
 */
export function applyCorrections(
  segs: StyledSegment[],
  corrections: Array<{ orig: string; fix: string; offset: number }>,
): StyledSegment[] {
  if (!corrections.length) return segs;

  const plain = toPlainText(segs);

  // Sort corrections by offset desc so replacements don't shift subsequent offsets
  const sorted = [...corrections].sort((a, b) => b.offset - a.offset);

  // Build a mutable array of characters with their segment styles
  type CharEntry = { char: string } & Omit<StyledSegment, 'text'>;
  const chars: CharEntry[] = [];
  for (const seg of segs) {
    const style = { bold: seg.bold, italic: seg.italic, underline: seg.underline, highlight: seg.highlight };
    for (const ch of seg.text) {
      chars.push({ char: ch, ...style });
    }
  }

  for (const c of sorted) {
    if (c.offset < 0 || c.offset + c.orig.length > chars.length) continue;
    if (plain.slice(c.offset, c.offset + c.orig.length) !== c.orig) continue;

    // The style of the FIRST character of the original span is carried over to all replacement chars
    const refStyle = {
      bold:      chars[c.offset].bold,
      italic:    chars[c.offset].italic,
      underline: chars[c.offset].underline,
      highlight: chars[c.offset].highlight,
    };

    const replacementChars: CharEntry[] = [...c.fix].map(ch => ({ char: ch, ...refStyle }));
    chars.splice(c.offset, c.orig.length, ...replacementChars);
  }

  // Rebuild segments from char array
  const newSegs: StyledSegment[] = [];
  for (const entry of chars) {
    const { char, ...style } = entry;
    const last = newSegs[newSegs.length - 1];
    if (
      last &&
      last.bold      === style.bold &&
      last.italic    === style.italic &&
      last.underline === style.underline &&
      last.highlight === style.highlight
    ) {
      last.text += char;
    } else {
      newSegs.push({ text: char, ...style });
    }
  }

  return mergeSegments(newSegs);
}
