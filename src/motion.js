import { $, $$, esc } from "./ui.js";

// Freely licensed photographs from Malappuram district (see public/media/CREDITS.md).
export const PHOTOS = {
  evening: {
    file: "payyanad-evening.jpg",
    place: "Payyanad stadium, Manjeri",
    alt: "Floodlit evening crowd at the Malappuram District Sports Complex in Payyanad",
    author: "Kamarudheenelankur",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Malappuram_District_Sports_Complex_%26_Football_Academy.jpg",
  },
  ground: {
    file: "pallikkal-ground.jpg",
    place: "College Road ground, Pallikkal Bazar",
    alt: "Children playing football on a red-earth ground lined with coconut palms in Pallikkal",
    author: "Prof tpms",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Football_ground_on_College_Road,_Pallikkal_Bazar.jpg",
  },
  match: {
    file: "payyanad-match.jpg",
    place: "District Sports Complex, Payyanad",
    alt: "A packed match at the Malappuram District Sports Complex with hills behind the stands",
    author: "Shakkeerpadathakayil",
    license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Malappuram_District_Sports_Complex_Stadium.jpg",
  },
  sunset: {
    file: "kottakkunnu-sunset.jpg",
    place: "Sunset from Kottakkunnu",
    alt: "The sun setting over Malappuram town, framed by trees on Kottakkunnu hill",
    author: "Dhruvaraj S",
    license: "CC BY 2.0",
    source: "https://commons.wikimedia.org/wiki/File:A_sunset_from_Kottakkunnu,_Malappuram.jpg",
  },
  paddy: {
    file: "vazhakkad-paddy.jpg",
    place: "Paddy fields, Vazhakkad",
    alt: "Green paddy fields stretching to misty hills in Vazhakkad",
    author: "Drnisamudheen",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Paddy_field_in_Vazhakkad_Malappuram_Kerala.jpg",
  },
  beach: {
    file: "ponnani-beach.jpg",
    place: "Ponnani beach",
    alt: "The sun setting over the Arabian Sea at Ponnani beach",
    author: "Mohamod Fasil",
    license: "CC BY 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Ponnani_beach_during_sunset.jpg",
  },
};
export const credit = (p) =>
  `<a class="photo-credit" href="${p.source}" target="_blank" rel="noopener noreferrer">Photo: ${esc(p.author)}, ${p.license}</a>`;
export const ball = (cls = "ball") =>
  `<svg class="${cls}" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18.5" fill="#fff" stroke="#14261c" stroke-width="1.5"/><path d="M20 12.5l7 5.1-2.7 8.2h-8.6L13 17.6z" fill="#14261c"/><path d="M20 12.5V3.6M27 17.6l8.4-2.8M24.3 25.8l5.2 7.2M15.7 25.8l-5.2 7.2M13 17.6l-8.4-2.8" stroke="#14261c" stroke-width="1.5" fill="none"/></svg>`;

const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Fade the new page in whenever the router swaps #main.
export function pageEnter() {
  const main = $("#main");
  main.classList.remove("page-enter");
  void main.offsetWidth;
  main.classList.add("page-enter");
}

// Reveal cards and sections as they scroll into view, staggering siblings.
const revealable =
  ".turf-card, .booking-row, .detail-section, .story-tile, .story-copy, .contact-band, .stat, .empty-state, .photo-gallery, .form-section, .checkout-info";
const observer =
  "IntersectionObserver" in window
    ? new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            e.target.classList.add("in");
            observer.unobserve(e.target);
          }),
        { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
      )
    : null;
function watch(root) {
  if (!observer || calm()) return;
  const found = root.matches?.(revealable) ? [root] : [];
  found.push(...root.querySelectorAll(revealable));
  for (const el of found) {
    if (el.classList.contains("reveal")) continue;
    const siblings = [...el.parentElement.children].filter((x) => x.matches(revealable));
    el.style.setProperty("--i", Math.min(siblings.indexOf(el), 8));
    el.classList.add("reveal");
    observer.observe(el);
  }
}

// Cross-fade hero photographs; stops by itself once the hero leaves the page.
export function heroSlides() {
  const slides = $$(".hero-slide");
  if (slides.length < 2) return;
  let index = 0;
  $$(".hero-dots button").forEach((b, i) => (b.onclick = () => show(i)));
  if (calm()) return;
  const timer = setInterval(() => {
    if (!slides[0].isConnected) return clearInterval(timer);
    if (document.hidden) return;
    show((index + 1) % slides.length);
  }, 6500);
  function show(next) {
    slides[index].classList.remove("active");
    index = next;
    slides[index].classList.add("active");
    const p = PHOTOS[slides[index].dataset.photo];
    $("#hero-place").textContent = p.place;
    $("#hero-credit").outerHTML = credit(p).replace("<a ", '<a id="hero-credit" ');
    $$(".hero-dots button").forEach((b, i) => b.setAttribute("aria-current", i === index));
  }
}

export function initMotion() {
  const main = $("#main");
  new MutationObserver((records) =>
    records.forEach((r) => r.addedNodes.forEach((n) => n.nodeType === 1 && watch(n))),
  ).observe(main, { childList: true, subtree: true });
  const header = $("#header");
  const onScroll = () => header.classList.toggle("scrolled", scrollY > 12);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  // Track the pointer over the hero so the floodlight glow follows it.
  main.addEventListener("pointermove", (e) => {
    const hero = e.target.closest?.(".intro");
    if (!hero || calm()) return;
    const r = hero.getBoundingClientRect();
    hero.style.setProperty("--mx", ((e.clientX - r.left) / r.width).toFixed(3));
    hero.style.setProperty("--my", ((e.clientY - r.top) / r.height).toFixed(3));
  });
}
