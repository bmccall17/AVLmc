import { renderOgImage } from './lib/og-image-shared';
async function test() {
  try {
    const response = await renderOgImage({
      eventTitle: 'Good Hot Fish at Wicked Weed West',
      artistName: 'Good Hot Fish',
      venueName: 'Wicked Weed West',
      eventDate: '2026-06-14',
      eventTime: '1:00 PM',
      imageUrl: 'https://example.com/image.jpg',
      tags: ['Live Music'],
      source: 'AVLgo'
    });
    console.log('Success, status:', response.status);
    console.log(await response.text());
  } catch (e) {
    console.error('ERROR:', e);
  }
}
test();
