interface RevealOptions {
	delay?: number;
	threshold?: number;
}

export function reveal(node: HTMLElement, options: RevealOptions = {}) {
	const { delay = 0, threshold = 0.12 } = options;

	node.classList.add('reveal-init');
	if (delay) node.style.animationDelay = `${delay}ms`;

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					node.classList.remove('reveal-init');
					node.classList.add('reveal-in');
					observer.unobserve(node);
				}
			}
		},
		{ threshold }
	);

	observer.observe(node);

	return {
		destroy() {
			observer.disconnect();
		}
	};
}
