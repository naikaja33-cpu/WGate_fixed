// The kinds of post in the community forum. `key` is what is saved; the rest is display only.
export const CATEGORIES = [
  { key: 'flat_rent', label: 'Flat for Rent', short: 'Rent', closedLabel: 'Rented', priceLabel: 'Rent per month (₹)', priceSuffix: ' / month', style: 'bg-blue-100 text-blue-700 border-blue-200' },
  { key: 'flat_sale', label: 'Flat for Sale', short: 'Sale', closedLabel: 'Sold', priceLabel: 'Price (₹)', priceSuffix: '', style: 'bg-violet-100 text-violet-700 border-violet-200' },
  { key: 'items', label: 'Household Items', short: 'Items', closedLabel: 'Sold', priceLabel: 'Price (₹)', priceSuffix: '', style: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { key: 'ad', label: 'Advertisement', short: 'Ads', closedLabel: 'Closed', priceLabel: 'Price (₹, optional)', priceSuffix: '', style: 'bg-amber-100 text-amber-700 border-amber-200' },
];

export const categoryOf = (key) => CATEGORIES.find((c) => c.key === key) || CATEGORIES[3];