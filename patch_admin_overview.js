const fs = require('fs');
const file = '../ante-social-frontend/src/app/dashboard/admin/page.tsx';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('const [displayLimit, setDisplayLimit] = useState')) {
  // Add display limit state
  code = code.replace(
    'const [searchQuery, setSearchQuery] = useState("")',
    'const [searchQuery, setSearchQuery] = useState("")\n  const [displayLimit, setDisplayLimit] = useState(10)'
  );

  // Replace filteredMarkets.map with paginated map
  code = code.replace(
    'filteredMarkets.map((market, index) => (',
    'filteredMarkets.slice(0, displayLimit).map((market, index) => ('
  );

  // Add Load More button
  const loadMoreJSX = `
              {filteredMarkets.length > displayLimit && (
                <div className="flex justify-center mt-6">
                  <button
                    onClick={() => setDisplayLimit(d => d + 10)}
                    className="px-6 py-2 rounded-xl bg-white border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
                  >
                    Load More
                  </button>
                </div>
              )}
  `;
  
  code = code.replace(
    '            </div>\n          </CardContent>\n        </DashboardCard>',
    '            </div>\n' + loadMoreJSX + '          </CardContent>\n        </DashboardCard>'
  );

  fs.writeFileSync(file, code);
}
