// Service templates for each business type
export const SERVICE_TEMPLATES: Record<string, Array<{ name: string; description: string }>> = {
  'Conference': [
    { name: 'Full-Day Conference Package', description: 'Complete conference facilities for up to 100 attendees with projector, sound system, and catering services' },
    { name: 'Half-Day Meeting Room', description: 'Professional meeting space for 20-50 people with high-speed WiFi and presentation equipment' },
    { name: 'Executive Boardroom', description: 'Premium boardroom for 12-20 executives with video conferencing and refreshments' },
    { name: 'Training Workshop Space', description: 'Interactive training space with breakout areas and all necessary equipment' },
  ],
  'Events': [
    { name: 'Wedding Reception Package', description: 'Complete wedding venue with decoration, catering, and entertainment for up to 200 guests' },
    { name: 'Corporate Gala Dinner', description: 'Elegant dinner setup for corporate events with premium catering and AV equipment' },
    { name: 'Birthday Party Package', description: 'Fun and festive birthday celebration space with decorations and catering options' },
    { name: 'Product Launch Event', description: 'Professional event space perfect for product launches with stage setup and lighting' },
  ],
  'VIP Cabins': [
    { name: 'Premium Cabin Experience', description: 'Luxurious private cabin with personal butler, gourmet dining, and entertainment system' },
    { name: 'Executive Retreat', description: 'Exclusive cabin space for business meetings with dining and privacy' },
    { name: 'Romantic Evening Package', description: 'Intimate cabin setting with candlelit dinner and premium beverages' },
    { name: 'Family Celebration Suite', description: 'Spacious cabin for family gatherings with customized menu and decor' },
  ],
  'Lounge & Bar': [
    { name: 'Signature Cocktails', description: 'Premium handcrafted cocktails by our expert mixologists using top-shelf spirits' },
    { name: 'Wine Selection', description: 'Curated collection of local and international wines for every palate' },
    { name: 'Tapas & Small Plates', description: 'Delicious appetizers and sharing plates perfect for socializing' },
    { name: 'Live Music Nights', description: 'Enjoy live performances every weekend in our sophisticated lounge atmosphere' },
  ],
  'Restaurant': [
    { name: 'Chef Special Tasting Menu', description: 'Five-course gourmet experience featuring seasonal ingredients and innovative preparations' },
    { name: 'Grilled Specialties', description: 'Premium grilled meats and seafood prepared to perfection' },
    { name: 'Vegetarian Delights', description: 'Creative plant-based dishes that satisfy and impress' },
    { name: 'Family Dining Package', description: 'Complete family meal with appetizers, mains, and desserts for 4-6 people' },
  ],
  'Barbershop': [
    { name: 'Premium Haircut & Styling', description: 'Expert haircut with consultation, wash, styling, and finishing products' },
    { name: 'Beard Grooming Service', description: 'Professional beard trim, shaping, and conditioning treatment' },
    { name: 'Hot Towel Shave', description: 'Traditional straight razor shave with hot towels and premium products' },
    { name: 'Grooming Package', description: 'Complete grooming experience including haircut, beard trim, and facial treatment' },
  ],
  'Auto Spa': [
    { name: 'Exterior Wash & Wax', description: 'Thorough exterior cleaning with premium wax protection for lasting shine' },
    { name: 'Interior Detailing', description: 'Deep cleaning of interior surfaces, vacuuming, and conditioning' },
    { name: 'Full Vehicle Detailing', description: 'Complete interior and exterior detailing for showroom-quality results' },
    { name: 'Engine Bay Cleaning', description: 'Professional engine compartment cleaning and degreasing service' },
  ],
  'Carpet Cleaning': [
    { name: 'Deep Carpet Cleaning', description: 'Professional steam cleaning removes stains and restores carpet freshness' },
    { name: 'Upholstery Cleaning', description: 'Gentle yet effective cleaning for sofas, chairs, and fabric furniture' },
    { name: 'Mattress Sanitization', description: 'Deep cleaning and sanitization for healthy, fresh mattresses' },
    { name: 'Stain Removal Treatment', description: 'Specialized treatment for tough stains on carpets and upholstery' },
  ],
};

export const PAGES_WITH_INFO_CARDS = [
  { key: 'conference', label: 'Conference', category: 'Conference' },
  { key: 'events', label: 'Events', category: 'Events' },
  { key: 'vip', label: 'VIP Cabins', category: 'VIP Cabins' },
  { key: 'lounge', label: 'Lounge', category: 'Lounge & Bar' },
  { key: 'restaurant', label: 'Restaurant', category: 'Restaurant' },
  { key: 'grooming-care', label: 'Grooming Care', category: 'Barbershop', subcategory: 'Barbershop' },
  { key: 'grooming-care', label: 'Grooming Care', category: 'Auto Spa', subcategory: 'Auto Spa' },
  { key: 'grooming-care', label: 'Grooming Care', category: 'Carpet Cleaning', subcategory: 'Carpet Cleaning' },
];
