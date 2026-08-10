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
  return <div className="docPdfGrayBar">{children}</div>;
}

function CellContent({ children, center }) {
  return <span className={`docPdfCellContent${center ? ' center' : ''}`}>{children}</span>;
}

export function label(text, width, colSpan) { return { isLabel: true, text, width, colSpan }; }
export function value(text, colSpan) { return { isLabel: false, text: text || '', colSpan }; }

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
        {text || ''}
      </div>
    </div>
  );
}

/* Check-all-that-apply / single-select rendering — `options` is a list of
   strings, `checked` is either an array (multi-select) or a single string
   (single-select) of the option(s) that are checked. */
export function CheckboxGrid({ options, checked, oneColumn }) {
  const checkedList = Array.isArray(checked) ? checked : [checked].filter(Boolean);
  return (
    <div className={`docPdfCheckboxGrid${oneColumn ? ' oneColumn' : ''}`}>
      {options.map(opt => {
        const isChecked = checkedList.includes(opt);
        return (
          <div className={`docPdfCheckboxRow${isChecked ? ' checked' : ''}`} key={opt}>
            <span className={`docPdfCheckbox${isChecked ? ' checked' : ''}`}>{isChecked ? '✓' : ''}</span>
            <span>{opt}</span>
          </div>
        );
      })}
    </div>
  );
}

export function SignatureRow({ label: sigLabel, dateLabel = 'Date', signatureData, dateValue }) {
  return (
    <div className="docPdfSignatureRow">
      <div className="docPdfSignatureBlock">
        {signatureData ? <img src={signatureData} alt="Signature" className="docPdfSignatureImg" /> : <div className="docPdfSignatureLine" />}
        <span className="docPdfSignatureCaption">{sigLabel}</span>
      </div>
      <div className="docPdfSignatureBlock">
        <div className="docPdfSignatureLine" style={{ display: 'flex', alignItems: 'flex-end', fontSize: '10pt', paddingBottom: 2 }}>
          {fmtDate(dateValue)}
        </div>
        <span className="docPdfSignatureCaption">{dateLabel}</span>
      </div>
    </div>
  );
}
