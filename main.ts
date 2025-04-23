import {
	App, Plugin, PluginSettingTab, Setting,
	debounce, finishRenderMath, loadMathJax
} from 'obsidian';

declare global {
	interface Window {
		MathJax: any;
	}
}

interface BidiCommands {
	RTL: string[];
	LTR: string[];
}

interface Settings {
	cmds: BidiCommands;
}

const DEFAULT_CMDS: BidiCommands = {
	RTL: ['R'],
	LTR: ['L'],
};

export default class RtlMathTextPlugin extends Plugin {
	settings: Settings;
	private mathjaxPatcher?: MathJaxBidiCommandPatcher;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new RtlMathTextSettingsTab(this.app, this));
		await this.patchMathJax();
	}

	private async patchMathJax() {
		this.mathjaxPatcher?.destroy();
		this.mathjaxPatcher = new MathJaxBidiCommandPatcher(this.settings.cmds);
		await this.mathjaxPatcher.init();
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = {
			cmds: Object.assign({}, DEFAULT_CMDS, data?.cmds),
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
		await this.patchMathJax();
	}

	onunload() {
		this.mathjaxPatcher?.destroy();
		this.mathjaxPatcher = undefined;
	}

}

class MathJaxBidiCommandPatcher {
	private cmds: BidiCommands;
	private mathjaxStyleObserver?: MutationObserver;
	private styleEl?: HTMLStyleElement;

	constructor(cmds: BidiCommands) {
		this.cmds = cmds;
	}

	async init() {
		await loadMathJax();

		// Extend MathJax macros
		const defs = [];
		for (const dir in this.cmds) {
			for (const cmd of this.cmds[dir as keyof BidiCommands]) {
				defs.push(`\\def\\${cmd}#1{\\class{mjx-${dir.toLowerCase()}}{#1}}`);
			}
		}
		window.MathJax.tex2chtml(defs.join('\n'), { display: false });

		// // Re-typeset existing math
		// if (window.MathJax.typesetPromise) {
		// 	await window.MathJax.typesetPromise();
		// }

		// Patch styles after initial MathJax stylesheet flush
		await finishRenderMath();
		this.patchStyles();

		// Patch styles on MathJax stylesheet change
		this.mathjaxStyleObserver = new MutationObserver(() => this.patchStyles());
		this.mathjaxStyleObserver.observe(this.getMathJaxStyleElement(), {
			attributes: true,
		});
	}

	destroy() {
		this.mathjaxStyleObserver?.disconnect();
		this.styleEl?.remove();
	}

	private patchStyles() {
		const rules = this.convertMathJaxStylesToLogicalProperties();
		this.styleEl?.remove();
		this.styleEl = document.head.createEl('style', {
			text: rules.join('\n')
		});
	}

	private getMathJaxStyleElement() {
		return document.getElementById('MJX-CHTML-styles') as HTMLStyleElement;
	}

	private convertMathJaxStylesToLogicalProperties(): string[] {
		const rules: string[] = [];
		const styleEl = this.getMathJaxStyleElement();

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
}

class RtlMathTextSettingsTab extends PluginSettingTab {
	plugin: RtlMathTextPlugin;

	constructor(app: App, plugin: RtlMathTextPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('p', {
			text: 'Changes may require restarting Obsidian to take full effect.',
			cls: 'setting-item-description'
		});

		const cmds = this.plugin.settings.cmds;
		for (const dir in cmds) {
			new Setting(containerEl)
				.setName(`${dir} commands`)
				.setDesc(`Comma-separated list of commands for ${dir}`)
				.addText(text =>
					text
						.setPlaceholder(dir === 'RTL' ? 'e.g. R, RLE' : 'e.g. L, LRE')
						.setValue(cmds[dir as keyof BidiCommands].join(', '))
						.onChange(debounce(
							async (val) => {
								cmds[dir as keyof BidiCommands] = val
									.split(',')
									.map(s => s.trim())
									.filter(Boolean);
								await this.plugin.saveSettings();
							}, 2000, true))
				);
		}

		new Setting(containerEl)
			.addButton(btn =>
				btn
					.setButtonText('Restore Defaults')
					.onClick(async () => {
						this.plugin.settings.cmds = { ...DEFAULT_CMDS };
						await this.plugin.saveSettings();
						this.display();
					})
			);
	}
}
