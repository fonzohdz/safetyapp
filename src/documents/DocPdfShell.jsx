/* ── Shared PDF page-shell components for the four new documents ──
   Modeled directly on IncidentPdf.jsx's exported primitives (IncidentPageShell,
   GrayBar, InfoTable, TextBlock, CellContent) — same visual language, same
   capture approach (plain DOM at true 8.5x11in size, captured by
   html2canvas — see pdfExportCore.js), namespaced under docPdf* (docPdf.css)
   so nothing here touches Incident's own CSS/markup. */

const SHACKELFORD_LOGO = `${import.meta.env.BASE_URL}icons/shackelford-logo.webp`;

export function fmtDate(v) {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return v;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

export function fmtDateTime(v) {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!m) return v;
  const [, y, mo, d, h, mi] = m;
  const hour = Number(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = ((hour + 11) % 12) + 1;
  return `${mo}/${d}/${y} ${h12}:${mi} ${ampm}`;
}

export function DocPdfPageShell({ pageRef, pageNumber, totalPages, draft, watermarkText = 'DRAFT', formTitle, headerLabel, children }) {
  return (
    <div ref={pageRef} className="docPdfPage">
      <header className="docPdfHeader">
        <div className="docPdfHeaderBar">
          <img src={SHACKELFORD_LOGO} alt="Shackelford Construction and Hauling" className="docPdfHeaderLogo" />
          <div className="docPdfHeaderTitles">
            <h1>{formTitle}</h1>
            {headerLabel && <h2>{headerLabel}</h2>}
          </div>
          <div className="docPdfHeaderPageNum">Page {pageNumber} of {totalPages}</div>
        </div>
        <div className="docPdfRedRule" />
      </header>
      <div className="docPdfBody">{children}</div>
      {draft && <div className="docPdfWatermark">{watermarkText}</div>}
    </div>
  );
}

export function GrayBar({ children }) {
  // Inner span so the export-only raster calibration (docPdf.css) can lift
  // the TITLE TEXT without moving the bar's own fill/borders.
  return <div className="docPdfGrayBar"><span className="docPdfBarText">{children}</span></div>;
}

/* Thin outlined numbered section header -- lighter-weight alternative to
   GrayBar's full gray fill, used where a document has many short numbered
   sections in a row (e.g. Disciplinary Notice's 7 sections) and a
   full-width gray block per section would read as heavier than the source
   paper form actually is. */
export function NumberedBar({ number, children }) {
  return (
    <div className="docPdfNumberedBar">
      {number != null && <span className="docPdfNumberedBarBadge"><span className="docPdfBarText">{number}</span></span>}
      <span className="docPdfBarText">{children}</span>
    </div>
  );
}

function CellContent({ children, center }) {
  return <span className={`docPdfCellContent${center ? ' center' : ''}`}>{children}</span>;
}

export function label(text, width, colSpan) { return { isLabel: true, text, width, colSpan }; }
export function value(text, colSpan) { return { isLabel: false, text: text || '', colSpan }; }

/* Two label/value pairs on one physical row (label,value,label,value) —
   the "paired employee-information cells" layout used by the source paper
   forms so a page of employee-info fields reads as a compact 2-column
   block instead of one long single-column list. Both label columns share
   labelWidth; the two value columns split the remainder evenly (table-layout:
   fixed sizes undeclared columns equally from the first row). */
export function pairRow(label1, value1, label2, value2, labelWidth = '17%') {
  return [label(label1, labelWidth), value(value1), label(label2, labelWidth), value(value2)];
}

export function InfoTable({ rows }) {
  return (
    <table className="docPdfInfoTable">
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              cell.isLabel
                ? <th key={j} style={cell.width ? { width: cell.width } : undefined} colSpan={cell.colSpan}><CellContent>{cell.text}</CellContent></th>
                : <td key={j} colSpan={cell.colSpan}><CellContent>{cell.text}</CellContent></td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TextBlock({ title, help, text, minHeightPx }) {
  return (
    <div className="docPdfTextBlockWrap">
      {title && <div className="docPdfTextBlockTitle">{title}</div>}
      {help && <div className="docPdfTextBlockHelp">{help}</div>}
      <div className="docPdfTextBlock" style={minHeightPx ? { minHeight: `${minHeightPx}px` } : undefined}>
        {/* Inner span exists so the export-only raster calibration in
            docPdf.css can shift the TEXT without moving the block's own
            borders (same pattern as .docPdfCellContent). */}
        <span className="docPdfTextBlockText">{text || ''}</span>
      </div>
    </div>
  );
}

/* Check-all-that-apply / single-select rendering — `options` is a list of
   strings, `checked` is either an array (multi-select) or a single string
   (single-select) of the option(s) that are checked. */
export function CheckboxGrid({ options, checked, oneColumn, oneRow }) {
  const checkedList = Array.isArray(checked) ? checked : [checked].filter(Boolean);
  return (
    <div className={`docPdfCheckboxGrid${oneColumn ? ' oneColumn' : ''}${oneRow ? ' oneRow' : ''}`}>
      {options.map(opt => {
        const isChecked = checkedList.includes(opt);
        return (
          <div className={`docPdfCheckboxRow${isChecked ? ' checked' : ''}`} key={opt}>
            <span className={`docPdfCheckbox${isChecked ? ' checked' : ''}`}>{isChecked ? <span className="docPdfCheckMark">✓</span> : ''}</span>
            <span className="docPdfCheckboxLabel">{opt}</span>
          </div>
        );
      })}
    </div>
  );
}

export function SignatureRow({ label: sigLabel, dateLabel = 'Date', signatureData, dateValue }) {
  return (
    <div className="docPdfSignatureRow">
      {/* One slot carries THE signing rule whether or not a signature image
          is present. Previously the rule was drawn twice — once by the
          line/date div's border-bottom and again by the caption's
          border-top — which printed as two parallel hairlines under every
          signature and every date. */}
      <div className="docPdfSignatureBlock">
        <div className="docPdfSignatureSlot">
          {signatureData && <img src={signatureData} alt="Signature" className="docPdfSignatureImg" />}
        </div>
        <span className="docPdfSignatureCaption">{sigLabel}</span>
      </div>
      <div className="docPdfSignatureBlock">
        <div className="docPdfSignatureSlot docPdfSignatureSlotDate">
          <span className="docPdfSigDateText">{fmtDate(dateValue)}</span>
        </div>
        <span className="docPdfSignatureCaption">{dateLabel}</span>
      </div>
    </div>
  );
}

/* N signature blocks side by side in one row (e.g. Separation's Employee /
   Supervisor / HR-Management three-column approval block) — each item is
   { label, signatureData, dateValue, note }. `note` (e.g. "Refused /
   Unavailable to Sign") replaces the signature line/date entirely for that
   one column, rather than showing a blank line next to two real
   signatures. */
export function MultiSignatureRow({ items }) {
  return (
    <div className="docPdfMultiSignatureRow" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((it, i) => (
        <div className="docPdfSignatureBlock" key={i}>
          <div className={`docPdfSignatureSlot${it.note ? ' docPdfSignatureNote' : ''}`}>
            {it.note
              ? <span className="docPdfSigNoteText">{it.note}</span>
              : it.signatureData && <img src={it.signatureData} alt="Signature" className="docPdfSignatureImg" />}
          </div>
          <span className="docPdfSignatureCaption">{it.label}</span>
          {!it.note && <span className="docPdfSignatureDateCaption">{fmtDate(it.dateValue)}</span>}
        </div>
      ))}
    </div>
  );
}
