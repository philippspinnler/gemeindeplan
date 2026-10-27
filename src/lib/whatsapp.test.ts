import { expect, it } from 'vitest';
import { whatsappAskUrl } from './whatsapp';

it('builds a WhatsApp request that leaves out a missing theme and duration', () => {
	const text = (url: string) => decodeURIComponent(url.slice('https://wa.me/?text='.length));
	const full = text(whatsappAskUrl({ firstName: 'Anna', task: 'eine Ansprache zu geben', date: '2026-11-22', theme: 'Glaube', minutes: 10, sender: 'Beat Muster' }));
	expect(full).toBe('Hoi Anna\n\nWärst du bereit, am Sonntag, 22. November in der Abendmahlsversammlung eine Ansprache zu geben? Das Thema ist «Glaube», ca. 10 Minuten.\n\nGib mir doch kurz Bescheid. Vielen Dank!\n\nLiebe Grüsse\nBeat Muster');
	const bare = text(whatsappAskUrl({ firstName: 'Anna', task: 'das Anfangsgebet zu sprechen', date: '2026-11-22', sender: 'Beat Muster' }));
	expect(bare).toContain('das Anfangsgebet zu sprechen?\n');
});
