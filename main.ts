import { Plugin, loadMathJax, finishRenderMath } from 'obsidian';

declare global {
	interface Window {
		MathJax: any;
	}
}

export default class RtlMathTextPlugin extends Plugin {
	private mathjaxStyleObserver?: MutationObserver;
	private styleEl?: HTMLStyleElement;

	async onload() {
		await loadMathJax();

		// Extend MathJax macros
		window.MathJax.tex2chtml(`
			\\def\\R#1{\\class{mjx-rtl}{#1}}
			\\def\\L#1{\\class{mjx-ltr}{#1}}
			\\def\\RLE#1{\\class{mjx-rtl}{#1}}
			\\def\\LRE#1{\\class{mjx-ltr}{#1}}
			`,
			{ display: false }
		);

		// Re-typeset existing math
		if (window.MathJax.typesetPromise) {
			await window.MathJax.typesetPromise();
		}

		// Patch styles after initial MathJax stylesheet flush
		await finishRenderMath();
		this.patchStyles();

		// Patch styles on MathJax stylesheet change
		this.mathjaxStyleObserver = new MutationObserver(() => this.patchStyles());
		this.mathjaxStyleObserver.observe(getMathJaxStyleElement(), {
			attributes: true,
		});
	}

	onunload() {
		this.mathjaxStyleObserver?.disconnect();
		this.styleEl?.remove();
	}

	patchStyles() {
		const rules = convertMathJaxStylesToLogicalProperties();
		this.styleEl?.remove();
		this.styleEl = document.head.createEl('style', {
			text: rules.join('\n')
		});
	}
}

function getMathJaxStyleElement() {
	return document.getElementById('MJX-CHTML-styles') as HTMLStyleElement;
}

function convertMathJaxStylesToLogicalProperties(): string[] {
	const rules: string[] = [];
	const styleEl = getMathJaxStyleElement();

	if (!styleEl || !styleEl.sheet) return rules;

	for (const rule of Array.from(styleEl.sheet.cssRules)) {
		if (!(rule instanceof CSSStyleRule)) continue;

		const styleLines: string[] = [];

		const paddingLeft = rule.style.getPropertyValue('padding-left');
		const paddingRight = rule.style.getPropertyValue('padding-right');
		const marginLeft = rule.style.getPropertyValue('margin-left');
		const marginRight = rule.style.getPropertyValue('margin-right');

		if (paddingLeft) styleLines.push(`padding-inline-start: ${paddingLeft};`);
		if (paddingRight) styleLines.push(`padding-inline-end: ${paddingRight};`);
		if (marginLeft) styleLines.push(`margin-inline-start: ${marginLeft};`);
		if (marginRight) styleLines.push(`margin-inline-end: ${marginRight};`);

		if (styleLines.length > 0) {
			const newRule = `${rule.selectorText} {\n  ${styleLines.join('\n  ')}\n}`;
			rules.push(newRule);
		}
	}

	return rules;
}
