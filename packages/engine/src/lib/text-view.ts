/**
 * The reader's text view switch: `html[data-text-view="on"]`, kept in
 * `sessionStorage` for the tab's session. Below 900 px wide or 500 px tall the view is automatic
 * (styles/components/reading-view.css) and the switch is hidden.
 */
export const TEXT_VIEW_KEY = "deck:text-view";

/**
 * Sets the attribute before the stage paints, from the session's choice, so a reload in text view
 * never shows the stage first. The reader routes render it as an inline script ahead of the stage.
 */
export const TEXT_VIEW_BOOT = `try{if(sessionStorage.getItem(${JSON.stringify(TEXT_VIEW_KEY)})==="on")document.documentElement.dataset.textView="on"}catch(e){}`;
