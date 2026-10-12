import { Search } from "lucide-react";

import Button from "./Button.jsx";

// Toolbar above a list: a search box, optional filter controls (children,
// typically <Select> elements) and a Reset button that appears when any
// filter is active.
//
//   <FilterBar search={search} onSearchChange={setSearch}
//              hasActiveFilters={hasActiveFilters} onReset={resetFilters}
//              actions={<Button>Add college</Button>}>
//     <Select label="Status" ...>...</Select>
//   </FilterBar>
export default function FilterBar({
  search = "",
  onSearchChange,
  searchPlaceholder = "Search",
  searchLabel = "Search",
  hasActiveFilters = false,
  onReset,
  actions,
  children,
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end">
      {onSearchChange && (
        <div className="min-w-0 flex-1 lg:max-w-sm">
          <label
            className="mb-2 block text-sm font-medium text-gray-700"
            htmlFor="list-search"
          >
            {searchLabel}
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={16}
            />
            <input
              autoComplete="off"
              className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#1B3A1E] focus:ring-2 focus:ring-[#1B3A1E]/10"
              id="list-search"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              type="search"
              value={search}
            />
          </div>
        </div>
      )}

      {children && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
          {children}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
        {hasActiveFilters && onReset && (
          <Button onClick={onReset} size="sm" variant="ghost">
            Reset filters
          </Button>
        )}
        {actions}
      </div>
    </div>
  );
}
