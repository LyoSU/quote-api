// utils/quote-generate/text-layout.js
// Layout phase: line breaking, positioning, shrink-wrap.
// Pure arithmetic — no canvas calls, no async. Can be called many times cheaply.

const { RTL_REGEX, NEUTRAL_REGEX } = require('./constants')

/**
 * Determine text direction for a line starting at segmentIndex.
 * Scans ahead until a strong directional character is found.
 */
function getLineDirection (segments, startIndex) {
  for (let i = startIndex; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.kind === 'space' || seg.kind === 'break') continue
    if (seg.text.match(RTL_REGEX)) return 'rtl'
    if (!seg.text.match(NEUTRAL_REGEX)) return 'ltr'
  }
  return 'ltr'
}

/**
 * Layout text segments into lines within maxWidth/maxHeight constraints.
 *
 * Ported algorithms from pretext:
 * - Trailing space hanging (spaces at line end don't count for width)
 * - Pending-break tracking (rewind to last valid break point on overflow)
 * - Overflow-wrap at grapheme boundaries
 */
function layoutText (prepared, maxWidth, maxHeight) {
  const { segments, fontSize, lineHeight, emojiSize } = prepared
  if (segments.length === 0) {
    return { lines: [], width: 0, height: 0, lineCount: 0, truncated: false }
  }

  // Clamp max dimensions
  if (maxWidth > 10000) maxWidth = 10000
  if (maxHeight > 10000) maxHeight = 10000

  const lines = []
  let currentLine = { segments: [], width: 0, direction: 'ltr' }
  let lineY = fontSize // Start at fontSize for canvas baseline offset
  let maxLineWidth = 0
  let truncated = false

  // Pending break tracking (from pretext)
  // lineWidth excludes trailing space — matches hanging-space semantics
  let pendingBreak = null // { segIndex, lineWidth, lineSegCount }

  currentLine.direction = getLineDirection(segments, 0)

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]

    // Hard break
    if (seg.kind === 'break') {
      // Only truncate if there is actual content after this break
      const hasMoreContent = i + 1 < segments.length
      if (hasMoreContent && maxHeight > 0 && lineY + lineHeight > maxHeight) {
        truncated = true
        applyTruncation(currentLine, prepared, maxWidth)
        break
      }

      // Finalize current line
      if (currentLine.width > maxLineWidth) maxLineWidth = currentLine.width
      currentLine.y = lineY
      lines.push(currentLine)
      lineY += lineHeight
      pendingBreak = null

      // Start new line
      currentLine = { segments: [], width: 0, direction: getLineDirection(segments, i + 1) }
      continue
    }

    const segWidth = seg.kind === 'emoji' ? emojiSize : seg.width

    // Trailing space hanging (from pretext): spaces past the edge don't trigger wrap
    if (seg.kind === 'space' && currentLine.width + segWidth > maxWidth) {
      // Hang the space — add to line but don't count in width
      currentLine.segments.push({ index: i, width: segWidth })
      continue
    }

    // Handle overwide segment on an empty line — loop-split across lines
    if (currentLine.segments.length === 0 && segWidth > maxWidth && seg.kind === 'text' && prepared.computeGraphemeWidths) {
      var gData = prepared.computeGraphemeWidths(seg)
      if (gData && gData.widths.length > 1) {
        var cursor = 0
        while (cursor < gData.texts.length) {
          var fitCount = 0
          var fitWidth = 0
          for (var g = cursor; g < gData.widths.length; g++) {
            if (fitWidth + gData.widths[g] > maxWidth && fitCount > 0) break
            fitWidth += gData.widths[g]
            fitCount++
          }
          if (fitCount === 0) { fitCount = 1; fitWidth = gData.widths[cursor] }

          var isLast = cursor + fitCount >= gData.texts.length
          currentLine.segments.push({
            index: i,
            width: fitWidth,
            graphemeStart: cursor > 0 ? cursor : undefined,
            graphemeEnd: isLast ? undefined : cursor + fitCount
          })
          currentLine.width += fitWidth

          if (!isLast) {
            if (currentLine.width > maxLineWidth) maxLineWidth = currentLine.width
            currentLine.y = lineY
            lines.push(currentLine)
            lineY += lineHeight
            currentLine = { segments: [], width: 0, direction: currentLine.direction }
          }
          cursor += fitCount
        }
        continue
      }
    }

    // Check if segment fits
    if (currentLine.width + segWidth > maxWidth && currentLine.segments.length > 0) {
      // Overflow — need to break

      // Check if next line would exceed maxHeight
      if (maxHeight > 0 && lineY + lineHeight > maxHeight) {
        truncated = true
        applyTruncation(currentLine, prepared, maxWidth)
        break
      }

      if (pendingBreak) {
        // Rewind to last break opportunity (from pretext)
        const { segIndex, lineWidth, lineSegCount } = pendingBreak

        // Trim current line back to pending break point
        currentLine.segments.length = lineSegCount
        currentLine.width = lineWidth

        // Finalize line
        if (currentLine.width > maxLineWidth) maxLineWidth = currentLine.width
        currentLine.y = lineY
        lines.push(currentLine)
        lineY += lineHeight
        pendingBreak = null

        // Start new line, replay from segment after the break
        const newDirection = getLineDirection(segments, segIndex + 1)
        currentLine = { segments: [], width: 0, direction: newDirection }
        i = segIndex // loop will i++ to segIndex + 1
        continue
      }

      // No pending break — try overflow-wrap at grapheme boundaries
      if (prepared.computeGraphemeWidths) {
        const remainingWidth = currentLine.width === 0 ? maxWidth : maxWidth - currentLine.width
        const gData = prepared.computeGraphemeWidths(seg)
        if (gData && gData.widths.length > 1) {
          let fitCount = 0
          let fitWidth = 0

          for (let g = 0; g < gData.widths.length; g++) {
            if (fitWidth + gData.widths[g] > remainingWidth && fitCount > 0) break
            fitWidth += gData.widths[g]
            fitCount++
          }

          if (fitCount > 0 && fitCount < gData.texts.length) {
            // Split segment: put fitCount graphemes on current line
            currentLine.segments.push({ index: i, width: fitWidth, graphemeEnd: fitCount })
            currentLine.width += fitWidth

            // Finalize current line
            if (currentLine.width > maxLineWidth) maxLineWidth = currentLine.width
            currentLine.y = lineY
            lines.push(currentLine)
            lineY += lineHeight

            // Loop-split remainder across as many lines as needed
            var remCursor = fitCount
            var remDirection = getLineDirection(segments, i)
            currentLine = { segments: [], width: 0, direction: remDirection }

            while (remCursor < gData.texts.length) {
              var rFit = 0
              var rWidth = 0
              for (var rg = remCursor; rg < gData.widths.length; rg++) {
                if (rWidth + gData.widths[rg] > maxWidth && rFit > 0) break
                rWidth += gData.widths[rg]
                rFit++
              }
              if (rFit === 0) { rFit = 1; rWidth = gData.widths[remCursor] }

              var remIsLast = remCursor + rFit >= gData.texts.length
              currentLine.segments.push({
                index: i,
                width: rWidth,
                graphemeStart: remCursor > 0 ? remCursor : undefined,
                graphemeEnd: remIsLast ? undefined : remCursor + rFit
              })
              currentLine.width += rWidth

              if (!remIsLast) {
                if (currentLine.width > maxLineWidth) maxLineWidth = currentLine.width
                currentLine.y = lineY
                lines.push(currentLine)
                lineY += lineHeight
                currentLine = { segments: [], width: 0, direction: remDirection }
              }
              remCursor += rFit
            }
            continue
          }
        }
      }

      // Finalize current line (no split happened)
      if (currentLine.width > maxLineWidth) maxLineWidth = currentLine.width
      currentLine.y = lineY
      lines.push(currentLine)
      lineY += lineHeight

      // Start new line with current segment
      const newDirection = getLineDirection(segments, i)
      currentLine = { segments: [], width: 0, direction: newDirection }

      if (seg.kind !== 'space') {
        currentLine.segments.push({ index: i, width: segWidth })
        currentLine.width += segWidth
      }

      pendingBreak = null
      continue
    }

    // Track break opportunities (spaces)
    if (seg.kind === 'space') {
      pendingBreak = {
        segIndex: i,
        lineWidth: currentLine.width, // Exclude space width (hanging-space semantics)
        lineSegCount: currentLine.segments.length
      }
    }

    // Add segment to current line
    currentLine.segments.push({ index: i, width: segWidth })
    currentLine.width += segWidth
  }

  // Finalize last line
  if (currentLine.segments.length > 0) {
    if (currentLine.width > maxLineWidth) maxLineWidth = currentLine.width
    currentLine.y = lineY
    lines.push(currentLine)
  }

  // Compute x positions for each segment within its line
  for (const line of lines) {
    let x = 0
    // Also compute actual content width (excluding trailing spaces)
    let contentWidth = 0
    for (const seg of line.segments) {
      seg.x = x
      x += seg.width
      const srcSeg = segments[seg.index]
      if (srcSeg && srcSeg.kind !== 'space') {
        contentWidth = x
      }
    }
    line.contentWidth = contentWidth || line.width
  }

  const totalHeight = lines.length > 0 ? lines[lines.length - 1].y + fontSize : 0

  return {
    lines,
    width: maxLineWidth,
    height: totalHeight,
    lineCount: lines.length,
    truncated
  }
}

/**
 * Trim segments from line to fit within maxWidth and mark as truncated.
 */
function applyTruncation (line, prepared, maxWidth) {
  // Empty line (e.g. truncation hit at a \n\n boundary) — nothing to trim
  if (line.segments.length === 0) {
    line.width = 0
    line.truncated = true
    return
  }

  const ctx = require('./text-prepare').getMeasureCtx()
  const ellipsis = '\u2026'
  // Set font to last segment's font so ellipsis is measured at the correct size
  const lastLayoutSeg = line.segments[line.segments.length - 1]
  if (lastLayoutSeg) {
    const lastSeg = prepared.segments[lastLayoutSeg.index]
    if (lastSeg) ctx.font = lastSeg.font
  }
  const ellipsisWidth = ctx.measureText(ellipsis).width
  const targetWidth = maxWidth - ellipsisWidth

  // Trim segments until total width fits within targetWidth
  let totalWidth = 0
  let trimIndex = line.segments.length
  for (let s = 0; s < line.segments.length; s++) {
    if (totalWidth + line.segments[s].width > targetWidth) {
      trimIndex = s
      break
    }
    totalWidth += line.segments[s].width
  }

  line.segments.length = Math.max(1, trimIndex)
  if (totalWidth === 0) {
    totalWidth = line.segments[0].width
  }
  line.width = totalWidth
  line.truncated = true
}

/**
 * Find the tightest container width without increasing line count.
 * Binary search over maxWidth (from pretext's walkLineRanges concept).
 */
function shrinkWrap (prepared, maxWidth, maxHeight) {
  const initial = layoutText(prepared, maxWidth, maxHeight)

  // Single line, empty, or already truncated — don't shrink further
  if (initial.lineCount <= 1 || initial.truncated) return initial

  // Find the widest segment (absolute minimum width)
  let maxSegWidth = 0
  for (const seg of prepared.segments) {
    if (seg.width > maxSegWidth) maxSegWidth = seg.width
  }

  // Binary search for tightest width
  let lo = Math.max(maxSegWidth, initial.width / initial.lineCount * 0.7)
  let hi = initial.width
  const targetLineCount = initial.lineCount

  // ~10 iterations for 2px precision on typical widths
  while (hi - lo > 2) {
    const mid = (lo + hi) / 2
    const trial = layoutText(prepared, mid, maxHeight)

    if (trial.lineCount <= targetLineCount && !trial.truncated) {
      hi = mid // fits — try narrower
    } else {
      lo = mid // too narrow — widen
    }
  }

  return layoutText(prepared, Math.ceil(hi), maxHeight)
}

module.exports = { layoutText, shrinkWrap, getLineDirection }
