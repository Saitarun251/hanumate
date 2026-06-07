import starlight from '@astrojs/starlight';

export default {
	integrations: [
		starlight({
			title: 'RubberDuck',
			tagline: 'The Agent Harness Framework',
			social: {
				github: 'https://github.com/kishkindhalabs/hanumate',
			},
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', link: '/guides/introduction' },
						{ label: 'Quick Start', link: '/guides/quick-start' },
					],
				},
			],
		}),
	],
};