const slides = [...document.querySelectorAll('.hero-slide')];
const dots = [...document.querySelectorAll('.pagination-dot')];
const heroIndex = document.querySelector('.hero-index strong');
let currentSlide = 0;
let autoplay;

function showSlide(index, userInitiated = false) {
  currentSlide = (index + slides.length) % slides.length;
  slides.forEach((slide, i) => {
    const active = i === currentSlide;
    slide.classList.toggle('is-active', active);
    slide.setAttribute('aria-hidden', String(!active));
  });
  dots.forEach((dot, i) => {
    const active = i === currentSlide;
    dot.classList.toggle('is-active', active);
    dot.setAttribute('aria-selected', String(active));
  });
  heroIndex.textContent = String(currentSlide + 1).padStart(2, '0');
  if (userInitiated) restartAutoplay();
}

function restartAutoplay() {
  pauseAutoplay();
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    autoplay = window.setInterval(() => showSlide(currentSlide + 1), 6500);
  }
}

function pauseAutoplay() {
  window.clearInterval(autoplay);
  autoplay = undefined;
}

document.querySelector('.hero-prev').addEventListener('click', () => showSlide(currentSlide - 1, true));
document.querySelector('.hero-next').addEventListener('click', () => showSlide(currentSlide + 1, true));
dots.forEach((dot, index) => dot.addEventListener('click', () => showSlide(index, true)));
restartAutoplay();

document.querySelectorAll('.buy-button').forEach((button) => {
  button.addEventListener('pointerenter', pauseAutoplay);
  button.addEventListener('pointerleave', restartAutoplay);
  button.addEventListener('focus', pauseAutoplay);
  button.addEventListener('blur', restartAutoplay);
});

const filterButtons = [...document.querySelectorAll('.category-button')];
const productCards = [...document.querySelectorAll('.product-card')];

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const filter = button.dataset.filter;
    filterButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    productCards.forEach((card) => {
      card.hidden = card.dataset.category !== filter;
    });
  });
});

// Permet à la nouvelle page d'accueil d'ouvrir directement la bonne famille.
const requestedCategory = new URLSearchParams(window.location.search).get('category');
const requestedFilter = filterButtons.find((button) => button.dataset.filter === requestedCategory);
if (requestedFilter) requestedFilter.click();

const cartCount = document.querySelector('.cart-count');
const cartButton = document.querySelector('.cart-button');
const toast = document.querySelector('.toast');
const toastCopy = document.querySelector('.toast-copy');
let cartItems = 0;
let toastTimeout;

function addToCart(product) {
  cartItems += 1;
  cartCount.textContent = cartItems;
  cartButton.setAttribute('aria-label', `Panier, ${cartItems} article${cartItems > 1 ? 's' : ''}`);
  toastCopy.textContent = `${product} ajouté au panier`;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

document.querySelectorAll('.buy-button, .card-add').forEach((button) => {
  button.addEventListener('click', () => addToCart(button.dataset.product));
});

document.querySelectorAll('.heart-button').forEach((button) => {
  button.addEventListener('click', () => {
    const active = button.classList.toggle('is-favorite');
    button.setAttribute('aria-label', button.getAttribute('aria-label').replace(active ? 'Ajouter' : 'Retirer', active ? 'Retirer' : 'Ajouter'));
  });
});

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
});
