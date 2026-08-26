/**
 * Hit-test an element's centre point.
 *
 * Step 2 of the CONTRIBUTING verification order: a control can be styled
 * correctly and still be unclickable because something is sitting on top of it.
 * Only meaningful under a real browser -- jsdom has no layout, so
 * elementFromPoint() cannot answer this.
 */
export function hitTestCentre(el: Element): Element | null {
  const rect = el.getBoundingClientRect();
  return document.elementFromPoint(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2
  );
}

/** True when `el` is the hit-test result at its own centre, or contains it. */
export function isHittable(el: Element): boolean {
  const hit = hitTestCentre(el);
  return hit !== null && (hit === el || el.contains(hit));
}
