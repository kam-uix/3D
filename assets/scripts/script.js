(function () {
  // ===== TABS (desktop & mobile) =====
  const navLinks = document.querySelectorAll('#main-nav .nav-link[data-tab], .mobile-nav-link[data-tab]');
  const tabs = document.querySelectorAll('.tab-content');

  function switchTab(targetId) {
    navLinks.forEach(l => {
      if (l.dataset.tab === targetId) l.classList.add('active');
      else l.classList.remove('active');
    });
    tabs.forEach(t => t.classList.toggle('hidden', t.id !== targetId));
    window.dispatchEvent(new CustomEvent('kam3d-tab-change', { detail: { tab: targetId } }));
  }

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(link.dataset.tab);
      document.getElementById('mobile-menu').classList.add('hidden');
    });
  });

  function openHashTab() {
    const target = location.hash.slice(1);
    if (target && document.getElementById(target) && [...navLinks].some(link => link.dataset.tab === target)) switchTab(target);
  }
  openHashTab();
  window.addEventListener('hashchange', openHashTab);

  // Mobile menu toggle
  document.getElementById('mobile-menu-btn').addEventListener('click', () => {
    document.getElementById('mobile-menu').classList.toggle('hidden');
  });

  // ===== LOAD MODELS DYNAMICALLY =====
  const grid = document.getElementById('models-grid');
  if (!grid) return; // exit if not on models page

  let cards = [];
  let currentCategory = 'all';
  let currentSearch = '';
  let currentPage = 1;
  let updateDisplay = () => {};
  const perPage = 12;
  const FAVOURITES_KEY = 'kam3d_favourites';

  // Get favourites from localStorage
  function getFavourites() {
    try {
      return JSON.parse(localStorage.getItem(FAVOURITES_KEY)) || [];
    } catch {
      return [];
    }
  }

  // Save favourites to localStorage
  function saveFavourites(favs) {
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify(favs));
  }

  // Load favourites and apply to cards on page load
  let favouriteModels = getFavourites();

  // Fetch model list and create cards
  fetch('models.json')
    .then(res => res.json())
    .then(models => {
      grid.innerHTML = ''; // clear loading state
      models.forEach(model => {
        const card = createModelCard(model);
        grid.appendChild(card);
      });
      // Initialize cards array and set up filtering
      cards = Array.from(grid.querySelectorAll('.model-card'));
      initFilters();
    })
    .catch(err => {
      grid.innerHTML = '<p class="text-ln-gray-500 col-span-full text-center py-20">Failed to load models. Check models.json file.</p>';
      console.error('Error loading models:', err);
    });

  // Create a single card element
  function createModelCard(model) {
    const card = document.createElement('div');
    card.className = 'model-card bg-white rounded-20 shadow-ln-card ring-1 ring-ln-gray-200 overflow-hidden transition-all group';
    card.dataset.category = model.category;
    card.dataset.name = model.name;
    card.dataset.src = `assets/models/${model.file}`;
    card.dataset.file = model.file;
    const authorName = model.name;

    card.innerHTML = `
      <div class="px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-2.5 h-2.5 rounded-full" style="background: rgb(237, 106, 94); box-shadow: rgba(0,0,0,0.16) 0px 0.75px 0.75px inset;"></div>
          <div class="w-2.5 h-2.5 rounded-full" style="background: rgb(244, 191, 78); box-shadow: rgba(0,0,0,0.16) 0px 0.75px 0.75px inset;"></div>
          <div class="w-2.5 h-2.5 rounded-full" style="background: rgb(97, 198, 85); box-shadow: rgba(0,0,0,0.16) 0px 0.75px 0.75px inset;"></div>
        </div>
      </div>
      <div class="px-2 pb-2">
        <div class="relative h-72 sm:h-80 overflow-hidden rounded-2xl ring-1 ring-ln-gray-100 bg-white">
          <model-viewer src="assets/models/${model.file}" camera-controls auto-rotate background-color="#eeeeee" shadow-intensity="1" style="width:100%; height:100%;" title="${model.name}"></model-viewer>
          <div class="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button class="download-btn flex h-9 w-9 items-center justify-center rounded-[11px] bg-white/80 shadow-ln-badge-gray hover:bg-white transition-colors" title="Download model" data-src="assets/models/${model.file}">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" class="size-5 text-ln-gray-500" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>
            </button>
            <button class="fullscreen-btn flex h-9 w-9 items-center justify-center rounded-[11px] bg-white/80 shadow-ln-badge-gray hover:bg-white transition-colors" title="Open fullscreen" data-src="assets/models/${model.file}">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" class="size-5 text-ln-gray-500"><path d="M8 3V5H4V9H2V3H8ZM2 21V15H4V19H8V21H2ZM22 21H16V19H20V15H22V21ZM22 9H20V5H16V3H22V9Z"/></svg>
            </button>
          </div>
        </div>
      </div>
      <div class="px-4 py-3 flex items-center justify-between">
        <h2 class="text-sm font-medium text-ln-gray-500">${authorName}</h2>
        <button class="favourite-btn flex h-9 w-9 items-center justify-center rounded-[11px] bg-ln-gray-50 shadow-ln-badge-gray hover:bg-ln-gray-100 transition-colors" title="Add to favourites">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="stroke-ln-gray-450 fav-icon" data-file="${model.file}"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/></svg>
        </button>
      </div>
    `;

    // Restore favourite state from localStorage
    if (favouriteModels.includes(model.file)) {
      const favBtn = card.querySelector('.favourite-btn');
      favBtn.classList.add('active');
      const icon = favBtn.querySelector('.fav-icon');
      icon.classList.add('text-ln-orange', 'fill-ln-orange');
      icon.classList.remove('stroke-ln-gray-450');
    }

    return card;
  }

  // Initialize filters after cards are loaded
  function initFilters() {
    const searchInput = document.getElementById('model-search');
    const categoryBtns = document.querySelectorAll('#category-filters button, #mobile-category-filters button');
    const mobileCategoryDropdown = document.getElementById('mobile-category-dropdown');
    const paginationDiv = document.getElementById('pagination');

    // Category button state
    function setActiveCategoryButton(category) {
      categoryBtns.forEach(btn => {
        if (btn.dataset.category === category) {
          btn.className = 'px-4 py-2 rounded-xl text-sm font-medium bg-ln-orange text-white shadow-ln-badge-gray';
        } else {
          btn.className = 'px-4 py-2 rounded-xl text-sm font-medium bg-white text-ln-gray-500 hover:shadow-ln-badge-gray transition-colors';
        }
      });
    }

    function filterCards() {
      return cards.filter(card => {
        const cat = card.dataset.category;
        const file = card.dataset.file;
        const name = card.dataset.name.toLowerCase();

        // Favourite filter: only show favourited models
        if (currentCategory === 'favourite') {
          if (!favouriteModels.includes(file)) return false;
        } else {
          // Normal category filter
          const matchCat = currentCategory === 'all' || cat === currentCategory;
          if (!matchCat) return false;
        }

        // Search filter
        const matchSearch = currentSearch === '' || name.includes(currentSearch.toLowerCase());
        return matchSearch;
      });
    }

    function renderPagination(filtered) {
      const totalPages = Math.ceil(filtered.length / perPage);
      paginationDiv.innerHTML = '';
      if (totalPages <= 1) return;

      const isMobile = window.innerWidth < 640; // Tailwind sm breakpoint

      const createPageBtn = (pageNum) => {
        const btn = document.createElement('button');
        btn.textContent = pageNum;
        btn.className = pageNum === currentPage
          ? 'px-4 py-2 sm:px-5 sm:py-3 rounded-xl text-sm font-medium bg-ln-orange text-white shadow-ln-badge-gray'
          : 'px-4 py-2 sm:px-5 sm:py-3 rounded-xl text-sm font-medium bg-white text-ln-gray-500 shadow-ln-badge-gray hover:bg-ln-gray-50 transition-all';
        btn.addEventListener('click', () => {
          currentPage = pageNum;
          updateDisplay();
        });
        return btn;
      };

      // Prev button
      const prev = document.createElement('button');
      prev.className = 'px-4 py-2 sm:px-5 sm:py-3 rounded-xl text-sm font-medium bg-white text-ln-gray-500 shadow-ln-badge-gray hover:bg-ln-gray-50 transition-all';
      prev.textContent = '←';
      prev.title = 'Previous';
      prev.disabled = currentPage === 1;
      prev.addEventListener('click', () => { if (currentPage > 1) { currentPage--; updateDisplay(); } });
      paginationDiv.appendChild(prev);

      if (isMobile) {
        // Mobile: prev [first] [current] [last] next
        paginationDiv.appendChild(createPageBtn(1));

        if (currentPage > 2) {
          const ellipsis = document.createElement('span');
          ellipsis.textContent = '…';
          ellipsis.className = 'px-1 text-ln-gray-400 text-sm';
          paginationDiv.appendChild(ellipsis);
        }

        if (currentPage !== 1 && currentPage !== totalPages) {
          paginationDiv.appendChild(createPageBtn(currentPage));
        }

        if (currentPage < totalPages - 1) {
          const ellipsis = document.createElement('span');
          ellipsis.textContent = '…';
          ellipsis.className = 'px-1 text-ln-gray-400 text-sm';
          paginationDiv.appendChild(ellipsis);
        }

        if (totalPages > 1) {
          paginationDiv.appendChild(createPageBtn(totalPages));
        }
      } else {
        // Desktop: full pagination
        if (totalPages <= 7) {
          for (let i = 1; i <= totalPages; i++) {
            paginationDiv.appendChild(createPageBtn(i));
          }
        } else {
          paginationDiv.appendChild(createPageBtn(1));

          if (currentPage > 3) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '…';
            ellipsis.className = 'px-2 py-3 text-ln-gray-400';
            paginationDiv.appendChild(ellipsis);
          }

          const start = Math.max(2, currentPage - 1);
          const end = Math.min(totalPages - 1, currentPage + 1);
          for (let i = start; i <= end; i++) {
            paginationDiv.appendChild(createPageBtn(i));
          }

          if (currentPage < totalPages - 2) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '…';
            ellipsis.className = 'px-2 py-3 text-ln-gray-400';
            paginationDiv.appendChild(ellipsis);
          }

          paginationDiv.appendChild(createPageBtn(totalPages));
        }
      }

      // Next button
      const next = document.createElement('button');
      next.className = 'px-4 py-2 sm:px-5 sm:py-3 rounded-xl text-sm font-medium bg-white text-ln-gray-500 shadow-ln-badge-gray hover:bg-ln-gray-50 transition-all';
      next.textContent = '→';
      next.title = 'Next';
      next.disabled = currentPage === totalPages;
      next.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; updateDisplay(); } });
      paginationDiv.appendChild(next);
    }

    updateDisplay = function () {
      const filtered = filterCards();
      cards.forEach(card => card.style.display = 'none');
      const start = (currentPage - 1) * perPage;
      filtered.slice(start, start + perPage).forEach(card => card.style.display = '');
      renderPagination(filtered);
    };

    // Category buttons (both desktop and mobile)
    categoryBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        currentCategory = btn.dataset.category;
        // Refresh favourites list when switching to favourite tab
        if (currentCategory === 'favourite') {
          favouriteModels = getFavourites();
        }
        setActiveCategoryButton(currentCategory);
        currentPage = 1;
        updateDisplay();
      });
    });

    // Mobile filter toggle
    document.getElementById('mobile-filter-btn').addEventListener('click', () => {
      mobileCategoryDropdown.classList.toggle('hidden');
    });

    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value;
      currentPage = 1;
      updateDisplay();
    });

    // Init
    setActiveCategoryButton('all');
    updateDisplay();
  }

  // ===== DOWNLOAD & FULLSCREEN =====
  document.addEventListener('click', (e) => {
    const downloadBtn = e.target.closest('.download-btn');
    if (downloadBtn) {
      e.stopPropagation();
      const src = downloadBtn.dataset.src;
      const a = document.createElement('a');
      a.href = src;
      a.download = src.split('/').pop();
      a.click();
    }

    const fullscreenBtn = e.target.closest('.fullscreen-btn');
    if (fullscreenBtn) {
      e.stopPropagation();
      const src = encodeURIComponent(fullscreenBtn.dataset.src);
      window.open(`fullscreen.html?src=${src}`, '_blank');
    }
  });

  window.addEventListener('kam3d-favourites-change', event => {
    favouriteModels = Array.isArray(event.detail) ? event.detail : getFavourites();
    cards.forEach(card => {
      const active = favouriteModels.includes(card.dataset.file);
      const button = card.querySelector('.favourite-btn');
      const icon = card.querySelector('.fav-icon');
      button?.classList.toggle('active', active);
      icon?.classList.toggle('text-ln-orange', active);
      icon?.classList.toggle('fill-ln-orange', active);
      icon?.classList.toggle('stroke-ln-gray-450', !active);
    });
    if (currentCategory === 'favourite') { currentPage = 1; updateDisplay(); }
  });

  // ===== FAVOURITES (red heart toggle + localStorage) =====
  document.addEventListener('click', (e) => {
    const favBtn = e.target.closest('.favourite-btn');
    if (favBtn) {
      favBtn.classList.toggle('active');
      const icon = favBtn.querySelector('.fav-icon');
      const file = icon.dataset.file;

      if (favBtn.classList.contains('active')) {
        icon.classList.add('text-ln-orange', 'fill-ln-orange');
        icon.classList.remove('stroke-ln-gray-450');
        // Add to localStorage if not already there
        if (!favouriteModels.includes(file)) {
          favouriteModels.push(file);
          saveFavourites(favouriteModels);
        }
      } else {
        icon.classList.remove('text-ln-orange', 'fill-ln-orange');
        icon.classList.add('stroke-ln-gray-450');
        // Remove from localStorage
        favouriteModels = favouriteModels.filter(f => f !== file);
        saveFavourites(favouriteModels);
      }

      // If currently viewing "favourite" filter, refresh the display
      if (currentCategory === 'favourite') {
        updateDisplay();
      }
    }
  });

})();
