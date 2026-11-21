import { createAnimation, type Animation } from '@ionic/react';

const DURATION = 420;
const EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

interface TransitionOpts {
  enteringEl: HTMLElement;
  leavingEl?: HTMLElement;
  direction?: string;
}

/**
 * A page sliding in whole over the one it opens from (header and footer with it), and back out the same way.
 * Ionic's iOS transition moves titles, toolbars and footers separately, which comes apart between pages
 * whose headers differ as much as Accounts' and a card's. Going back reuses it, as the router keeps the
 * animation a page was opened with.
 */
export function pageSlide(_baseEl: HTMLElement, opts: TransitionOpts): Animation {
  const rtl = document.dir === 'rtl';
  const offScreen = rtl ? 'translateX(-100%)' : 'translateX(100%)';
  // The page underneath drifts a little the other way.
  const underneath = rtl ? 'translateX(30%)' : 'translateX(-30%)';
  const back = opts.direction === 'back';

  const entering = createAnimation()
    .addElement(opts.enteringEl)
    .beforeRemoveClass('ion-page-invisible')
    .fill('both')
    .fromTo('transform', back ? underneath : offScreen, 'translateX(0)');
  const root = createAnimation().duration(DURATION).easing(EASING).addAnimation(entering);
  if (opts.leavingEl) {
    const leaving = createAnimation()
      .addElement(opts.leavingEl)
      .fromTo('transform', 'translateX(0)', back ? offScreen : underneath)
      // Going forward, the page left behind is hidden once covered and must not keep the shift, or it shows
      // shifted when its tab is opened again. Going back, the page is closed, so it stays out of sight.
      .fill(back ? 'both' : 'none');
    root.addAnimation(leaving);
  }
  return root;
}
