(function () {
    // ---------- ZAKŁADKI GŁÓWNE ----------
    const navLinks = document.querySelectorAll('#main-nav .nav-link');
    const tabs = document.querySelectorAll('.tab-content');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-tab');
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            tabs.forEach(t => t.classList.toggle('hidden', t.id !== target));
        });
    });

    // ---------- ULUBIONE ----------
    document.querySelectorAll('.favourite-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('text-ln-orange');
            btn.querySelector('svg').classList.toggle('fill-ln-orange');
        });
    });

    // ---------- FILTROWANIE I PAGINACJA ----------
    const grid = document.getElementById('models-grid');
    const cards = Array.from(grid.querySelectorAll('.model-card'));
    const searchInput = document.getElementById('model-search');
    const categoryBtns = document.querySelectorAll('#category-filters button');
    const paginationDiv = document.getElementById('pagination');

    let currentCategory = 'all';
    let currentSearch = '';
    let currentPage = 1;
    const perPage = 12;

    // Stan przycisków kategorii
    function setActiveCategoryButton(category) {
        categoryBtns.forEach(btn => {
            if (btn.dataset.category === category) {
                btn.className = 'px-4 py-2 rounded-xl text-sm font-medium bg-ln-orange text-white shadow-ln-badge-gray';
            } else {
                btn.className = 'px-4 py-2 rounded-xl text-sm font-medium bg-white text-ln-gray-500 hover:shadow-ln-badge-gray transition-colors';
            }
        });
    }

    // Filtruj karty
    function filterCards() {
        return cards.filter(card => {
            const cat = card.dataset.category;
            const name = card.dataset.name.toLowerCase();
            const matchCat = currentCategory === 'all' || cat === currentCategory;
            const matchSearch = currentSearch === '' || name.includes(currentSearch.toLowerCase());
            return matchCat && matchSearch;
        });
    }

    // Buduj paginację
    function renderPagination(filtered) {
        const totalPages = Math.ceil(filtered.length / perPage);
        paginationDiv.innerHTML = '';

        if (totalPages <= 1) return;

        // Previous
        const prev = document.createElement('button');
        prev.className = 'px-5 py-3 rounded-xl text-sm font-medium bg-white text-ln-gray-500 shadow-ln-badge-gray hover:bg-ln-gray-50 transition-all';
        prev.textContent = '← Previous';
        prev.disabled = currentPage === 1;
        prev.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                updateDisplay();
            }
        });
        paginationDiv.appendChild(prev);

        // Numery stron
        for (let i = 1; i <= totalPages; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.textContent = i;
            pageBtn.className = i === currentPage ?
                'px-5 py-3 rounded-xl text-sm font-medium bg-ln-orange text-white shadow-ln-badge-gray' :
                'px-5 py-3 rounded-xl text-sm font-medium bg-white text-ln-gray-500 shadow-ln-badge-gray hover:bg-ln-gray-50 transition-all';
            pageBtn.addEventListener('click', () => {
                currentPage = i;
                updateDisplay();
            });
            paginationDiv.appendChild(pageBtn);
        }

        // Next
        const next = document.createElement('button');
        next.className = 'px-5 py-3 rounded-xl text-sm font-medium bg-white text-ln-gray-500 shadow-ln-badge-gray hover:bg-ln-gray-50 transition-all';
        next.textContent = 'Next →';
        next.disabled = currentPage === totalPages;
        next.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                updateDisplay();
            }
        });
        paginationDiv.appendChild(next);
    }

    // Odśwież widok kart i paginacji
    function updateDisplay() {
        const filtered = filterCards();
        cards.forEach(card => card.style.display = 'none');
        const start = (currentPage - 1) * perPage;
        filtered.slice(start, start + perPage).forEach(card => card.style.display = '');
        renderPagination(filtered);
    }

    // Nasłuch kategorii
    categoryBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentCategory = btn.dataset.category;
            setActiveCategoryButton(currentCategory);
            currentPage = 1;
            updateDisplay();
        });
    });

    // Nasłuch wyszukiwarki
    searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value;
        currentPage = 1;
        updateDisplay();
    });

    // Inicjalizacja
    setActiveCategoryButton('all');
    updateDisplay();
})();