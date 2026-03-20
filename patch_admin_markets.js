const fs = require('fs');
const file = '../ante-social-frontend/src/app/dashboard/admin/markets/page.tsx';
let code = fs.readFileSync(file, 'utf8');

// Add pagination state
code = code.replace(
  'const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);',
  'const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);\n  const [currentPage, setCurrentPage] = useState(1);\n  const ITEMS_PER_PAGE = 10;'
);

// Reset page on tab or search change
code = code.replace(
  '  }, [activeTab, approvals, aiMarkets, flaggedQueue, resolutionQueue, searchQuery]);',
  '  }, [activeTab, approvals, aiMarkets, flaggedQueue, resolutionQueue, searchQuery]);\n\n  useEffect(() => {\n    setCurrentPage(1);\n  }, [activeTab, searchQuery]);\n\n  const paginatedMarkets = useMemo(() => {\n    return filteredMarkets.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);\n  }, [filteredMarkets, currentPage]);\n\n  const totalPages = Math.ceil(filteredMarkets.length / ITEMS_PER_PAGE);'
);

// Replace filteredMarkets.map with paginatedMarkets.map
code = code.replace(
  '{filteredMarkets.map((market, index) => (',
  '{paginatedMarkets.map((market, index) => ('
);

// Add pagination controls after the list
const paginationJSX = `
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-8">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 rounded-xl bg-white border border-neutral-200 text-sm font-medium disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm font-medium text-neutral-500">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 rounded-xl bg-white border border-neutral-200 text-sm font-medium disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
`;
code = code.replace(
  '          </div>\n        </div>\n      </div>\n    </div>\n  );\n}',
  `          </div>\n${paginationJSX}\n        </div>\n      </div>\n    </div>\n  );\n}`
);

fs.writeFileSync(file, code);
