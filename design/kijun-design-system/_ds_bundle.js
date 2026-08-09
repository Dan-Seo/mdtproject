/* @ds-bundle: {"format":4,"namespace":"KijunDesignSystem_7f1cd2","components":[{"name":"Button","sourcePath":"components/actions/Button.jsx"},{"name":"TimelinePill","sourcePath":"components/agent/TimelinePill.jsx"},{"name":"CodeBlock","sourcePath":"components/code/CodeBlock.jsx"},{"name":"IdeMockupCard","sourcePath":"components/code/IdeMockupCard.jsx"},{"name":"IdePane","sourcePath":"components/code/IdePane.jsx"},{"name":"Badge","sourcePath":"components/content/Badge.jsx"},{"name":"ComparisonCard","sourcePath":"components/content/ComparisonCard.jsx"},{"name":"FeatureCard","sourcePath":"components/content/FeatureCard.jsx"},{"name":"PricingTierCard","sourcePath":"components/content/PricingTierCard.jsx"},{"name":"TestimonialCard","sourcePath":"components/content/TestimonialCard.jsx"},{"name":"TextInput","sourcePath":"components/forms/TextInput.jsx"},{"name":"CtaBand","sourcePath":"components/marketing/CtaBand.jsx"},{"name":"HeroBand","sourcePath":"components/marketing/HeroBand.jsx"},{"name":"FooterLink","sourcePath":"components/navigation/Footer.jsx"},{"name":"Footer","sourcePath":"components/navigation/Footer.jsx"},{"name":"TopNav","sourcePath":"components/navigation/TopNav.jsx"}],"sourceHashes":{"components/actions/Button.jsx":"dc9f0aa6109a","components/agent/TimelinePill.jsx":"a083315e425c","components/code/CodeBlock.jsx":"9aafaabbfb08","components/code/IdeMockupCard.jsx":"489b29672041","components/code/IdePane.jsx":"a09716653c68","components/content/Badge.jsx":"e20542454641","components/content/ComparisonCard.jsx":"48419d398965","components/content/FeatureCard.jsx":"0276414ee784","components/content/PricingTierCard.jsx":"aac4eff782ca","components/content/TestimonialCard.jsx":"1bdd53977a71","components/forms/TextInput.jsx":"950d42d75919","components/marketing/CtaBand.jsx":"d9610f5ec79f","components/marketing/HeroBand.jsx":"c84dcf2ba808","components/navigation/Footer.jsx":"5303a953f869","components/navigation/TopNav.jsx":"7a99249fb39c","ui_kits/editor_app/EditorScreen.jsx":"93e5e12d09a2","ui_kits/marketing_site/BlogScreen.jsx":"93550e4c4fd9","ui_kits/marketing_site/EnterpriseScreen.jsx":"139ee8546065","ui_kits/marketing_site/HomeScreen.jsx":"5fcbdabe294c","ui_kits/marketing_site/PricingScreen.jsx":"9715fa8c73c5"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.KijunDesignSystem_7f1cd2 = window.KijunDesignSystem_7f1cd2 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/actions/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const base = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-xs)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--type-button-size)",
  fontWeight: "var(--type-button-weight)",
  lineHeight: 1,
  letterSpacing: 0,
  borderRadius: "var(--radius-md)",
  border: "1px solid transparent",
  boxShadow: "none",
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap",
  transition: "background-color .12s ease, color .12s ease, border-color .12s ease"
};
const variants = {
  primary: {
    rest: {
      background: "var(--color-primary)",
      color: "var(--color-on-primary)",
      padding: "10px 18px",
      height: 40
    },
    press: {
      background: "var(--color-primary-active)"
    }
  },
  secondary: {
    rest: {
      background: "var(--surface-card)",
      color: "var(--text-ink)",
      padding: "10px 18px",
      height: 40,
      borderColor: "var(--hairline-strong)"
    },
    press: {
      background: "var(--surface-strong)"
    }
  },
  tertiary: {
    rest: {
      background: "transparent",
      color: "var(--text-ink)",
      padding: "10px 2px",
      height: 40
    },
    press: {
      color: "var(--text-muted)"
    }
  },
  download: {
    rest: {
      background: "var(--text-ink)",
      color: "var(--text-on-ink)",
      padding: "12px 20px",
      height: 44
    },
    press: {
      background: "#3a382e"
    }
  }
};
function Button({
  variant = "primary",
  href,
  children,
  disabled = false,
  iconLeft,
  iconRight,
  fullWidth = false,
  onClick,
  type = "button",
  style,
  ...rest
}) {
  const [pressed, setPressed] = React.useState(false);
  const v = variants[variant] || variants.primary;
  const composed = {
    ...base,
    ...v.rest,
    ...(pressed && !disabled ? v.press : null),
    ...(fullWidth ? {
      width: "100%"
    } : null),
    ...(disabled ? {
      color: "var(--text-muted-soft)",
      background: variant === "tertiary" ? "transparent" : "var(--surface-strong)",
      cursor: "not-allowed",
      borderColor: "transparent"
    } : null),
    ...style
  };
  const Tag = href && !disabled ? "a" : "button";
  const press = disabled ? {} : {
    onPointerDown: () => setPressed(true),
    onPointerUp: () => setPressed(false),
    onPointerLeave: () => setPressed(false)
  };
  return /*#__PURE__*/React.createElement(Tag, _extends({
    href: href,
    type: Tag === "button" ? type : undefined,
    disabled: Tag === "button" ? disabled : undefined,
    onClick: disabled ? undefined : onClick,
    style: composed
  }, press, rest), iconLeft, children, iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Button.jsx", error: String((e && e.message) || e) }); }

// components/agent/TimelinePill.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const stages = {
  thinking: {
    bg: "var(--timeline-thinking)",
    fg: "var(--text-ink)",
    label: "Thinking"
  },
  grep: {
    bg: "var(--timeline-grep)",
    fg: "var(--text-ink)",
    label: "Grepping"
  },
  read: {
    bg: "var(--timeline-read)",
    fg: "var(--text-ink)",
    label: "Reading"
  },
  edit: {
    bg: "var(--timeline-edit)",
    fg: "var(--text-ink)",
    label: "Editing"
  },
  done: {
    bg: "var(--timeline-done)",
    fg: "var(--color-on-primary)",
    label: "Done"
  }
};
function TimelinePill({
  stage = "thinking",
  children,
  style,
  ...rest
}) {
  const s = stages[stage] || stages.thinking;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      background: s.bg,
      color: s.fg,
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-caption-uppercase-size)",
      fontWeight: "var(--type-caption-uppercase-weight)",
      lineHeight: "var(--type-caption-uppercase-lh)",
      letterSpacing: "var(--type-caption-uppercase-ls)",
      textTransform: "uppercase",
      borderRadius: "var(--radius-pill)",
      padding: "4px 10px",
      whiteSpace: "nowrap",
      ...style
    }
  }, rest), children || s.label);
}
Object.assign(__ds_scope, { TimelinePill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/agent/TimelinePill.jsx", error: String((e && e.message) || e) }); }

// components/code/CodeBlock.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function CodeBlock({
  filename,
  code,
  children,
  style,
  ...rest
}) {
  const lines = typeof code === "string" ? code.replace(/\n$/, "").split("\n") : null;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--hairline)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden",
      ...style
    }
  }, rest), filename ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "10px var(--space-md)",
      borderBottom: "1px solid var(--hairline)",
      fontFamily: "var(--font-mono)",
      fontSize: "var(--type-caption-uppercase-size)",
      letterSpacing: ".4px",
      color: "var(--text-muted)"
    }
  }, filename) : null, /*#__PURE__*/React.createElement("pre", {
    style: {
      margin: 0,
      padding: "var(--space-md)",
      fontFamily: "var(--font-mono)",
      fontSize: "var(--type-code-size)",
      lineHeight: 1.5,
      color: "var(--text-ink)",
      whiteSpace: "pre",
      overflowX: "auto"
    }
  }, lines ? lines.map((line, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      color: /^\s*(\/\/|#)/.test(line) ? "var(--text-muted-soft)" : "var(--text-ink)"
    }
  }, line || " ")) : children));
}
Object.assign(__ds_scope, { CodeBlock });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/code/CodeBlock.jsx", error: String((e && e.message) || e) }); }

// components/code/IdeMockupCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function IdeMockupCard({
  tabs = [],
  activeTab = 0,
  sidebar,
  editor,
  chat,
  terminal,
  height = 420,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--hairline)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      height,
      ...style
    }
  }, rest), tabs.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "stretch",
      borderBottom: "1px solid var(--hairline)",
      background: "var(--surface-card)"
    }
  }, tabs.map((t, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      padding: "10px 16px",
      fontFamily: "var(--font-mono)",
      fontSize: "var(--type-code-size)",
      color: i === activeTab ? "var(--text-ink)" : "var(--text-muted-soft)",
      borderRight: "1px solid var(--hairline)",
      background: i === activeTab ? "var(--color-canvas-soft)" : "transparent"
    }
  }, t))) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flex: 1,
      minHeight: 0,
      gap: 1,
      background: "var(--hairline)"
    }
  }, sidebar ? /*#__PURE__*/React.createElement("div", {
    style: {
      width: 180,
      background: "var(--surface-card)",
      minWidth: 0,
      overflow: "hidden"
    }
  }, sidebar) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: 1,
      background: "var(--hairline)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      background: "var(--surface-card)",
      overflow: "hidden"
    }
  }, editor), terminal ? /*#__PURE__*/React.createElement("div", {
    style: {
      height: 108,
      background: "var(--surface-card)",
      overflow: "hidden"
    }
  }, terminal) : null), chat ? /*#__PURE__*/React.createElement("div", {
    style: {
      width: 264,
      background: "var(--surface-card)",
      minWidth: 0,
      overflow: "hidden"
    }
  }, chat) : null));
}
Object.assign(__ds_scope, { IdeMockupCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/code/IdeMockupCard.jsx", error: String((e && e.message) || e) }); }

// components/code/IdePane.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function IdePane({
  title,
  children,
  mono = true,
  flush = false,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      flexDirection: "column",
      gap: title ? "var(--space-sm)" : 0,
      background: "var(--color-canvas-soft)",
      borderRadius: "var(--radius-md)",
      padding: flush ? 0 : "var(--space-base)",
      color: "var(--text-body)",
      fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
      fontSize: "var(--type-code-size)",
      lineHeight: 1.5,
      minWidth: 0,
      overflow: "hidden",
      ...style
    }
  }, rest), title ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-caption-uppercase-size)",
      fontWeight: 600,
      letterSpacing: "var(--type-caption-uppercase-ls)",
      textTransform: "uppercase",
      color: "var(--text-muted)",
      padding: flush ? "var(--space-sm) var(--space-base) 0" : 0
    }
  }, title) : null, children);
}
Object.assign(__ds_scope, { IdePane });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/code/IdePane.jsx", error: String((e && e.message) || e) }); }

// components/content/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Badge({
  children,
  tone = "default",
  style,
  ...rest
}) {
  const tones = {
    default: {
      background: "var(--surface-strong)",
      color: "var(--text-ink)"
    },
    onInk: {
      background: "rgba(247,247,244,.14)",
      color: "var(--text-on-ink)"
    },
    outline: {
      background: "transparent",
      color: "var(--text-muted)",
      boxShadow: "inset 0 0 0 1px var(--hairline-strong)"
    }
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      borderRadius: "var(--radius-pill)",
      padding: "4px 10px",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-caption-uppercase-size)",
      fontWeight: 600,
      lineHeight: 1.4,
      letterSpacing: "var(--type-caption-uppercase-ls)",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
      ...(tones[tone] || tones.default),
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/Badge.jsx", error: String((e && e.message) || e) }); }

// components/content/ComparisonCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Column({
  label,
  items,
  muted
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-sm)",
      padding: "var(--space-lg)",
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-caption-uppercase-size)",
      fontWeight: 600,
      letterSpacing: "var(--type-caption-uppercase-ls)",
      textTransform: "uppercase",
      color: muted ? "var(--text-muted)" : "var(--text-ink)"
    }
  }, label), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      padding: 0,
      listStyle: "none",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-xs)"
    }
  }, (items || []).map((item, i) => /*#__PURE__*/React.createElement("li", {
    key: i,
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-body-sm-size)",
      lineHeight: 1.5,
      color: muted ? "var(--text-muted)" : "var(--text-body-strong)"
    }
  }, item))));
}
function ComparisonCard({
  title,
  leftLabel = "Kijun",
  leftItems,
  rightLabel = "Other tools",
  rightItems,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--hairline)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden",
      ...style
    }
  }, rest), title ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-lg) var(--space-lg) 0",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-display-sm-size)",
      lineHeight: 1.3,
      letterSpacing: "-.11px",
      color: "var(--text-ink)"
    }
  }, title) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "stretch"
    }
  }, /*#__PURE__*/React.createElement(Column, {
    label: leftLabel,
    items: leftItems
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      background: "var(--hairline)"
    }
  }), /*#__PURE__*/React.createElement(Column, {
    label: rightLabel,
    items: rightItems,
    muted: true
  })));
}
Object.assign(__ds_scope, { ComparisonCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/ComparisonCard.jsx", error: String((e && e.message) || e) }); }

// components/content/FeatureCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function FeatureCard({
  eyebrow,
  title,
  children,
  media,
  padding = "var(--space-lg)",
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-sm)",
      background: "var(--surface-card)",
      border: "1px solid var(--hairline)",
      borderRadius: "var(--radius-lg)",
      padding,
      boxShadow: "none",
      ...style
    }
  }, rest), media, eyebrow ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-caption-uppercase-size)",
      fontWeight: 600,
      letterSpacing: "var(--type-caption-uppercase-ls)",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, eyebrow) : null, title ? /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-title-md-size)",
      fontWeight: 600,
      lineHeight: 1.4,
      color: "var(--text-ink)"
    }
  }, title) : null, children ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-body-sm-size)",
      lineHeight: 1.5,
      color: "var(--text-body)"
    }
  }, children) : null);
}
Object.assign(__ds_scope, { FeatureCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/FeatureCard.jsx", error: String((e && e.message) || e) }); }

// components/content/PricingTierCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function PricingTierCard({
  name,
  price,
  period = "/month",
  description,
  features = [],
  ctaLabel = "Get started",
  ctaVariant,
  featured = false,
  onCta,
  style,
  ...rest
}) {
  const ink = featured;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-md)",
      background: ink ? "var(--text-ink)" : "var(--surface-card)",
      color: ink ? "var(--text-on-ink)" : "var(--text-body)",
      border: "1px solid " + (ink ? "var(--text-ink)" : "var(--hairline)"),
      borderRadius: "var(--radius-lg)",
      padding: "var(--space-xl)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-xs)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-caption-uppercase-size)",
      fontWeight: 600,
      letterSpacing: "var(--type-caption-uppercase-ls)",
      textTransform: "uppercase",
      color: ink ? "var(--kj-warm-400)" : "var(--text-muted)"
    }
  }, name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: "6px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-display-lg-size)",
      fontWeight: 400,
      letterSpacing: "-.72px",
      color: ink ? "var(--color-canvas)" : "var(--text-ink)"
    }
  }, price), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-body-sm-size)",
      color: ink ? "var(--kj-warm-400)" : "var(--text-muted)"
    }
  }, period)), description ? /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-body-sm-size)",
      lineHeight: 1.5,
      color: ink ? "var(--kj-warm-400)" : "var(--text-body)"
    }
  }, description) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: ink ? "rgba(247,247,244,.18)" : "var(--hairline)"
    }
  }), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      padding: 0,
      listStyle: "none",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-sm)",
      flex: 1
    }
  }, features.map((f, i) => /*#__PURE__*/React.createElement("li", {
    key: i,
    style: {
      display: "flex",
      gap: "var(--space-xs)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-body-sm-size)",
      lineHeight: 1.5,
      color: ink ? "var(--color-canvas)" : "var(--text-body)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      color: ink ? "var(--kj-warm-400)" : "var(--hairline-strong)"
    }
  }, "\u2014"), /*#__PURE__*/React.createElement("span", null, f)))), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: ctaVariant || (featured ? "primary" : "secondary"),
    fullWidth: true,
    onClick: onCta
  }, ctaLabel));
}
Object.assign(__ds_scope, { PricingTierCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/PricingTierCard.jsx", error: String((e && e.message) || e) }); }

// components/content/TestimonialCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function TestimonialCard({
  quote,
  children,
  name,
  role,
  company,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("figure", _extends({
    style: {
      margin: 0,
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-base)",
      background: "var(--surface-card)",
      border: "1px solid var(--hairline)",
      borderRadius: "var(--radius-lg)",
      padding: "var(--space-lg)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("blockquote", {
    style: {
      margin: 0,
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-body-md-size)",
      lineHeight: 1.5,
      letterSpacing: ".08px",
      color: "var(--text-body)"
    }
  }, quote || children), /*#__PURE__*/React.createElement("figcaption", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "2px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-title-sm-size)",
      fontWeight: 600,
      color: "var(--text-ink)"
    }
  }, name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-caption-size)",
      color: "var(--text-muted)"
    }
  }, [role, company].filter(Boolean).join(", "))));
}
Object.assign(__ds_scope, { TestimonialCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/TestimonialCard.jsx", error: String((e && e.message) || e) }); }

// components/forms/TextInput.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function TextInput({
  label,
  value,
  defaultValue,
  placeholder,
  onChange,
  type = "text",
  error,
  disabled = false,
  id,
  style,
  ...rest
}) {
  const [focused, setFocused] = React.useState(false);
  const autoId = React.useId ? React.useId() : "kj-input";
  const inputId = id || autoId;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-xs)",
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-caption-uppercase-size)",
      fontWeight: 600,
      letterSpacing: "var(--type-caption-uppercase-ls)",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, label) : null, /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    type: type,
    value: value,
    defaultValue: defaultValue,
    placeholder: placeholder,
    disabled: disabled,
    onChange: onChange,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      height: 44,
      boxSizing: "border-box",
      padding: "12px 16px",
      background: disabled ? "var(--surface-strong)" : "var(--surface-card)",
      color: disabled ? "var(--text-muted-soft)" : "var(--text-ink)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-body-sm-size)",
      lineHeight: 1.5,
      borderRadius: "var(--radius-md)",
      border: "1px solid " + (error ? "var(--color-error)" : focused ? "var(--text-ink)" : "var(--hairline-strong)"),
      outline: "none",
      boxShadow: "none"
    }
  }, rest)), error ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-caption-size)",
      color: "var(--color-error)"
    }
  }, error) : null);
}
Object.assign(__ds_scope, { TextInput });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/TextInput.jsx", error: String((e && e.message) || e) }); }

// components/marketing/CtaBand.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function CtaBand({
  headline,
  subhead,
  ctaLabel = "Try Kijun now",
  onCta,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("section", _extends({
    style: {
      background: "var(--color-canvas)",
      borderTop: "1px solid var(--hairline)",
      padding: "var(--space-cta-band) var(--space-lg)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      gap: "var(--space-md)"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-display-lg-size)",
      fontWeight: 400,
      lineHeight: 1.2,
      letterSpacing: "var(--type-display-lg-ls)",
      color: "var(--text-ink)"
    }
  }, headline), subhead ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      maxWidth: 520,
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-body-md-size)",
      lineHeight: 1.5,
      color: "var(--text-body)"
    }
  }, subhead) : null, /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "primary",
    onClick: onCta,
    style: {
      marginTop: "var(--space-xs)"
    }
  }, ctaLabel)));
}
Object.assign(__ds_scope, { CtaBand });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/CtaBand.jsx", error: String((e && e.message) || e) }); }

// components/marketing/HeroBand.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function HeroBand({
  eyebrow,
  headline,
  subhead,
  primaryCta = "Download for macOS",
  secondaryCta = "All downloads",
  onPrimary,
  onSecondary,
  mockup,
  align = "center",
  style,
  ...rest
}) {
  const centered = align === "center";
  return /*#__PURE__*/React.createElement("section", _extends({
    style: {
      background: "var(--color-canvas)",
      padding: "var(--space-section) var(--space-lg)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      display: "flex",
      flexDirection: "column",
      alignItems: centered ? "center" : "flex-start",
      textAlign: centered ? "center" : "left",
      gap: "var(--space-lg)"
    }
  }, eyebrow ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-caption-uppercase-size)",
      fontWeight: 600,
      letterSpacing: "var(--type-caption-uppercase-ls)",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, eyebrow) : null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      maxWidth: 900,
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-display-mega-size)",
      fontWeight: 400,
      lineHeight: "var(--type-display-mega-lh)",
      letterSpacing: "var(--type-display-mega-ls)",
      color: "var(--text-ink)"
    }
  }, headline), subhead ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      maxWidth: 560,
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-body-md-size)",
      lineHeight: 1.5,
      letterSpacing: ".08px",
      color: "var(--text-body)"
    }
  }, subhead) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-base)",
      marginTop: "var(--space-xs)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "download",
    onClick: onPrimary
  }, primaryCta), secondaryCta ? /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "tertiary",
    onClick: onSecondary
  }, secondaryCta) : null), mockup ? /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      marginTop: "var(--space-xl)"
    }
  }, mockup) : null));
}
Object.assign(__ds_scope, { HeroBand });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/HeroBand.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Footer.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function FooterLink({
  children,
  href = "#",
  onClick,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("a", _extends({
    href: href,
    onClick: onClick,
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-body-sm-size)",
      lineHeight: 1.5,
      color: "var(--text-body)",
      textDecoration: "none",
      borderBottom: "none",
      ...style
    }
  }, rest), children);
}
function Footer({
  brand = "Kijun",
  columns = [],
  note,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("footer", _extends({
    style: {
      background: "var(--color-canvas)",
      borderTop: "1px solid var(--hairline)",
      padding: "64px var(--space-lg) 48px",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-xxl)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
      gap: "var(--space-xl)"
    }
  }, columns.map(col => /*#__PURE__*/React.createElement("div", {
    key: col.title,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-sm)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-caption-uppercase-size)",
      fontWeight: 600,
      letterSpacing: "var(--type-caption-uppercase-ls)",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, col.title), (col.links || []).map(l => /*#__PURE__*/React.createElement(FooterLink, {
    key: l
  }, l))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: "var(--space-base)",
      paddingTop: "var(--space-lg)",
      borderTop: "1px solid var(--hairline)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-body-sm-size)",
      color: "var(--color-primary)",
      fontWeight: 500
    }
  }, brand), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-caption-size)",
      color: "var(--text-muted)"
    }
  }, note))));
}
Object.assign(__ds_scope, { FooterLink, Footer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Footer.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TopNav.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function TopNav({
  brand = "Kijun",
  links = [],
  activeLink,
  onNavigate,
  signInLabel = "Sign in",
  ctaLabel = "Download",
  onCta,
  compact = false,
  style,
  ...rest
}) {
  const [open, setOpen] = React.useState(false);
  return /*#__PURE__*/React.createElement("header", _extends({
    style: {
      background: "var(--color-canvas)",
      borderBottom: "1px solid var(--hairline)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      height: "var(--nav-height)",
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      padding: "0 var(--space-lg)",
      display: "flex",
      alignItems: "center",
      gap: "var(--space-xl)"
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate && onNavigate(null);
    },
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "18px",
      fontWeight: 500,
      letterSpacing: "-.36px",
      color: "var(--color-primary)",
      textDecoration: "none",
      borderBottom: "none"
    }
  }, brand), !compact ? /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-lg)",
      flex: 1
    }
  }, links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate && onNavigate(l);
    },
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-nav-link-size)",
      fontWeight: 500,
      lineHeight: 1.4,
      color: activeLink === l ? "var(--text-ink)" : "var(--text-body)",
      textDecoration: "none",
      borderBottom: "none"
    }
  }, l))) : /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), !compact ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-base)"
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate && onNavigate(signInLabel);
    },
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-nav-link-size)",
      fontWeight: 500,
      color: "var(--text-body)",
      textDecoration: "none",
      borderBottom: "none"
    }
  }, signInLabel), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "primary",
    onClick: onCta,
    style: {
      height: 36,
      padding: "8px 16px"
    }
  }, ctaLabel)) : /*#__PURE__*/React.createElement("button", {
    "aria-label": "Menu",
    onClick: () => setOpen(!open),
    style: {
      width: 40,
      height: 40,
      display: "grid",
      gap: 4,
      alignContent: "center",
      justifyItems: "stretch",
      background: "transparent",
      border: "none",
      padding: "0 8px",
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      height: 1,
      background: "var(--text-ink)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      height: 1,
      background: "var(--text-ink)"
    }
  }))), compact && open ? /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid var(--hairline)",
      padding: "var(--space-base) var(--space-lg)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-sm)"
    }
  }, links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#",
    onClick: e => {
      e.preventDefault();
      setOpen(false);
      onNavigate && onNavigate(l);
    },
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--type-nav-link-size)",
      fontWeight: 500,
      color: "var(--text-body)",
      textDecoration: "none",
      borderBottom: "none"
    }
  }, l)), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "primary",
    fullWidth: true,
    onClick: onCta
  }, ctaLabel)) : null);
}
Object.assign(__ds_scope, { TopNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TopNav.jsx", error: String((e && e.message) || e) }); }

// ui_kits/editor_app/EditorScreen.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Icon({
  name,
  size = 14,
  color = "var(--text-muted)"
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (window.lucide && ref.current) {
      ref.current.innerHTML = "";
      const el = document.createElement("i");
      el.setAttribute("data-lucide", name);
      ref.current.appendChild(el);
      window.lucide.createIcons({
        nameAttr: "data-lucide",
        attrs: {
          width: size,
          height: size,
          "stroke-width": 1.5,
          stroke: color
        }
      });
    }
  });
  return /*#__PURE__*/React.createElement("span", {
    ref: ref,
    style: {
      display: "inline-flex",
      width: size,
      height: size,
      color
    }
  });
}
function FileRow({
  name,
  icon = "file-code",
  depth = 0,
  active,
  onClick
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "5px 12px",
      paddingLeft: 12 + depth * 14,
      background: active ? "var(--surface-strong)" : "transparent",
      border: "none",
      borderRadius: "var(--radius-sm)",
      width: "100%",
      textAlign: "left",
      cursor: "pointer",
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      color: active ? "var(--text-ink)" : "var(--text-body)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    color: active ? "var(--text-ink)" : "var(--text-muted-soft)"
  }), name);
}
function EditorScreen() {
  const {
    TimelinePill,
    Badge,
    Button,
    IdePane
  } = window.KijunDesignSystem_7f1cd2;
  const files = [{
    name: "app/",
    icon: "folder",
    depth: 0
  }, {
    name: "session.ts",
    icon: "file-code",
    depth: 1
  }, {
    name: "cookie.ts",
    icon: "file-code",
    depth: 1
  }, {
    name: "routes.ts",
    icon: "file-code",
    depth: 1
  }, {
    name: "lib/",
    icon: "folder",
    depth: 0
  }, {
    name: "kijun.config.ts",
    icon: "file-code",
    depth: 1
  }];
  const [active, setActive] = React.useState("session.ts");
  const [prompt, setPrompt] = React.useState("");
  const [steps, setSteps] = React.useState([{
    stage: "thinking",
    text: "Plan: move session parsing into middleware"
  }, {
    stage: "grep",
    text: "kijun.session( — 12 matches"
  }, {
    stage: "read",
    text: "app/routes.ts"
  }, {
    stage: "edit",
    text: "app/auth/session.ts  +42 −16"
  }, {
    stage: "done",
    text: "3 files changed · tests pass"
  }]);
  const code = ["import { cookies } from \"./cookie\"", "", "export async function load(req) {", "  const session = await kijun.session(req)", "  if (!session) return redirect(\"/login\")", "  return { user: session.user }", "}"];
  const send = () => {
    if (!prompt.trim()) return;
    setSteps([{
      stage: "thinking",
      text: prompt.trim()
    }, ...steps]);
    setPrompt("");
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "var(--color-canvas)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: "0 16px",
      borderBottom: "1px solid var(--hairline)",
      background: "var(--color-canvas)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 500,
      letterSpacing: "-.3px",
      color: "var(--color-primary)"
    }
  }, "Kijun"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      color: "var(--text-muted)"
    }
  }, "northwind/api"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Badge, {
    tone: "outline"
  }, "indexed 1,284 files")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      display: "flex",
      gap: 1,
      background: "var(--hairline)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 208,
      background: "var(--surface-card)",
      padding: "12px 8px",
      display: "flex",
      flexDirection: "column",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "0 12px 8px"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: ".88px",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, "Explorer")), files.map(f => /*#__PURE__*/React.createElement(FileRow, _extends({
    key: f.name
  }, f, {
    active: active === f.name,
    onClick: () => setActive(f.name)
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: 1,
      background: "var(--hairline)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-card)",
      display: "flex",
      borderBottom: "1px solid var(--hairline)"
    }
  }, ["session.ts", "routes.ts"].map(t => /*#__PURE__*/React.createElement("button", {
    key: t,
    onClick: () => setActive(t),
    style: {
      padding: "9px 16px",
      border: "none",
      borderRight: "1px solid var(--hairline)",
      background: active === t ? "var(--color-canvas-soft)" : "transparent",
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      color: active === t ? "var(--text-ink)" : "var(--text-muted-soft)",
      cursor: "pointer"
    }
  }, t))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      background: "var(--color-canvas-soft)",
      padding: 16,
      overflow: "auto"
    }
  }, code.map((line, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      gap: 16,
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      lineHeight: 1.6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      textAlign: "right",
      color: "var(--text-muted-soft)"
    }
  }, i + 1), /*#__PURE__*/React.createElement("span", {
    style: {
      color: line.trim().startsWith("//") ? "var(--text-muted-soft)" : "var(--text-ink)",
      whiteSpace: "pre"
    }
  }, line || " ")))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 116,
      background: "var(--surface-card)",
      padding: "12px 16px",
      overflow: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "terminal"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: ".88px",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, "Terminal")), /*#__PURE__*/React.createElement("pre", {
    style: {
      margin: 0,
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      lineHeight: 1.5,
      color: "var(--text-body)"
    }
  }, "$ kijun run --repo .\n› indexed 1,284 files in 2.1s\n› 3 files changed, tests pass"))), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 320,
      background: "var(--surface-card)",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 16px",
      borderBottom: "1px solid var(--hairline)",
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: ".88px",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, "Agent"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Icon, {
    name: "history"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      overflow: "auto",
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, steps.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(TimelinePill, {
    stage: s.stage
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: s.stage === "thinking" ? "var(--font-sans)" : "var(--font-mono)",
      fontSize: 13,
      lineHeight: 1.5,
      color: "var(--text-body)"
    }
  }, s.text)))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid var(--hairline)",
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("textarea", {
    value: prompt,
    onChange: e => setPrompt(e.target.value),
    placeholder: "Ask Kijun to change something\u2026",
    rows: 2,
    style: {
      resize: "none",
      padding: "10px 12px",
      borderRadius: "var(--radius-md)",
      border: "1px solid var(--hairline-strong)",
      background: "var(--surface-card)",
      fontFamily: "var(--font-sans)",
      fontSize: 14,
      color: "var(--text-ink)",
      outline: "none"
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    fullWidth: true,
    onClick: send
  }, "Run")))));
}
Object.assign(window, {
  EditorScreen,
  Icon,
  FileRow
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/editor_app/EditorScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing_site/BlogScreen.jsx
try { (() => {
function BlogScreen() {
  const {
    CodeBlock,
    Badge,
    TimelinePill
  } = window.KijunDesignSystem_7f1cd2;
  const [openPost, setOpenPost] = React.useState(null);
  const band = {
    maxWidth: "var(--container-max)",
    margin: "0 auto",
    padding: "var(--space-section) var(--space-lg)"
  };
  const posts = [{
    t: "How the repository index is built",
    d: "March 4, 2026",
    k: "Engineering",
    s: "Chunking, symbol graphs, and why we re-index on save instead of on commit."
  }, {
    t: "Reading an agent run",
    d: "February 18, 2026",
    k: "Product",
    s: "The five stages of the timeline, and what each one guarantees."
  }, {
    t: "Multi-file edits without the mess",
    d: "January 29, 2026",
    k: "Engineering",
    s: "How the agent stages a change set and verifies it before you see it."
  }];
  if (openPost !== null) {
    const p = posts[openPost];
    return /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("div", {
      style: {
        ...band,
        maxWidth: 720
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setOpenPost(null),
      style: {
        background: "none",
        border: "none",
        padding: 0,
        marginBottom: 24,
        fontSize: 14,
        fontWeight: 500,
        color: "var(--text-muted)",
        cursor: "pointer"
      }
    }, "\u2190 All posts"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-base)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 12,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement(Badge, null, p.k), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        color: "var(--text-muted)"
      }
    }, p.d)), /*#__PURE__*/React.createElement("h1", {
      style: {
        fontSize: 36,
        fontWeight: 400,
        letterSpacing: "-.72px",
        lineHeight: 1.2,
        color: "var(--text-ink)",
        margin: 0
      }
    }, p.t), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 16,
        lineHeight: 1.5,
        letterSpacing: ".08px",
        color: "var(--text-body)"
      }
    }, p.s, " The index is a symbol graph first and a text index second, which is why a rename in one file surfaces the twelve call sites you forgot about."), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 16,
        lineHeight: 1.5,
        letterSpacing: ".08px",
        color: "var(--text-body)"
      }
    }, "Re-indexing happens on save. A save touches one file; the graph update touches its neighbours. In a 1,200-file repository that settles in under 200ms."), /*#__PURE__*/React.createElement(CodeBlock, {
      filename: "lib/index/graph.ts",
      code: "// neighbours of a saved file, one hop\nexport function neighbours(file: FileId) {\n  return graph.edges(file).filter(e => e.kind === \"symbol\")\n}"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 8,
        alignItems: "center",
        paddingTop: 8
      }
    }, /*#__PURE__*/React.createElement(TimelinePill, {
      stage: "read"
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        color: "var(--text-muted)"
      }
    }, "Stage colours are documented in the design system.")), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 13,
        color: "var(--text-muted)"
      }
    }, "Written by the Kijun engineering team."))));
  }
  return /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("div", {
    style: band
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-xl)"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 36,
      fontWeight: 400,
      letterSpacing: "-.72px",
      lineHeight: 1.2,
      color: "var(--text-ink)",
      margin: 0
    }
  }, "Blog"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column"
    }
  }, posts.map((p, i) => /*#__PURE__*/React.createElement("button", {
    key: p.t,
    onClick: () => setOpenPost(i),
    style: {
      textAlign: "left",
      background: "none",
      border: "none",
      borderTop: "1px solid var(--hairline)",
      padding: "var(--space-lg) 0",
      cursor: "pointer",
      display: "grid",
      gridTemplateColumns: "160px 1fr",
      gap: "var(--space-lg)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: "var(--text-muted)"
    }
  }, p.d), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 22,
      fontWeight: 400,
      letterSpacing: "-.11px",
      color: "var(--text-ink)"
    }
  }, p.t), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      lineHeight: 1.5,
      color: "var(--text-body)",
      maxWidth: 620
    }
  }, p.s))))))));
}
Object.assign(window, {
  BlogScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing_site/BlogScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing_site/EnterpriseScreen.jsx
try { (() => {
function EnterpriseScreen() {
  const {
    FeatureCard,
    TextInput,
    Button,
    CodeBlock,
    Badge
  } = window.KijunDesignSystem_7f1cd2;
  const [sent, setSent] = React.useState(false);
  const band = {
    maxWidth: "var(--container-max)",
    margin: "0 auto",
    padding: "var(--space-section) var(--space-lg)"
  };
  const policy = "# .kijun/policy.yml\nindex:\n  scope: repository\n  redact: [\"**/*.pem\", \"**/secrets/*\"]\nagent:\n  require_review: true\n  max_files_per_run: 12";
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("div", {
    style: band
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "var(--space-xxl)",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-base)"
    }
  }, /*#__PURE__*/React.createElement(Badge, null, "Enterprise"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 36,
      fontWeight: 400,
      letterSpacing: "-.72px",
      lineHeight: 1.2,
      color: "var(--text-ink)",
      margin: 0
    }
  }, "Your codebase stays yours."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 16,
      lineHeight: 1.5,
      letterSpacing: ".08px",
      color: "var(--text-body)",
      maxWidth: 460
    }
  }, "Self-hosted indexing, per-repository policy, SSO, and an audit record of every agent run."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-base)",
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary"
  }, "Contact sales"), /*#__PURE__*/React.createElement(Button, {
    variant: "tertiary"
  }, "Read the security brief"))), /*#__PURE__*/React.createElement(CodeBlock, {
    filename: ".kijun/policy.yml",
    code: policy
  })))), /*#__PURE__*/React.createElement("section", {
    style: {
      borderTop: "1px solid var(--hairline)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: band
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: "var(--space-base)"
    }
  }, /*#__PURE__*/React.createElement(FeatureCard, {
    eyebrow: "Deployment",
    title: "Self-hosted index"
  }, "Run the indexer inside your VPC. Source never leaves the perimeter."), /*#__PURE__*/React.createElement(FeatureCard, {
    eyebrow: "Access",
    title: "SSO and SCIM"
  }, "Okta, Entra ID and Google Workspace, with automated de-provisioning."), /*#__PURE__*/React.createElement(FeatureCard, {
    eyebrow: "Audit",
    title: "Run-level records"
  }, "Every stage of every run is exportable as a signed record.")))), /*#__PURE__*/React.createElement("section", {
    style: {
      borderTop: "1px solid var(--hairline)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...band,
      maxWidth: 720
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--hairline)",
      borderRadius: "var(--radius-lg)",
      padding: "var(--space-xl)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-md)"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 26,
      fontWeight: 400,
      letterSpacing: "-.325px",
      color: "var(--text-ink)",
      margin: 0
    }
  }, "Talk to us"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "var(--space-base)"
    }
  }, /*#__PURE__*/React.createElement(TextInput, {
    label: "Work email",
    placeholder: "you@company.com"
  }), /*#__PURE__*/React.createElement(TextInput, {
    label: "Company",
    placeholder: "Northwind"
  }), /*#__PURE__*/React.createElement(TextInput, {
    label: "Engineers",
    placeholder: "120"
  }), /*#__PURE__*/React.createElement(TextInput, {
    label: "Repositories",
    placeholder: "8"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-base)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: () => setSent(true)
  }, "Request a call"), sent ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: "var(--color-success)"
    }
  }, "Thanks \u2014 we'll reply within one business day.") : null)))));
}
Object.assign(window, {
  EnterpriseScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing_site/EnterpriseScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing_site/HomeScreen.jsx
try { (() => {
function HomeScreen({
  go
}) {
  const {
    HeroBand,
    IdeMockupCard,
    IdePane,
    FeatureCard,
    ComparisonCard,
    TestimonialCard,
    TimelinePill,
    CtaBand,
    Badge
  } = window.KijunDesignSystem_7f1cd2;
  const tree = "  app/\n    auth/\n      session.ts\n      cookie.ts\n    routes.ts\n  lib/\n    kijun.config.ts";
  const code = "  export async function load(req) {\n    const session = await kijun.session(req)\n    if (!session) return redirect(\"/login\")\n    return { user: session.user }\n  }";
  const mockup = /*#__PURE__*/React.createElement(IdeMockupCard, {
    height: 430,
    tabs: ["session.ts", "routes.ts", "kijun.config.ts"],
    sidebar: /*#__PURE__*/React.createElement(IdePane, {
      flush: true,
      title: "Explorer"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "0 16px",
        whiteSpace: "pre",
        color: "var(--text-body)"
      }
    }, tree)),
    editor: /*#__PURE__*/React.createElement(IdePane, {
      flush: true
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "16px",
        whiteSpace: "pre",
        color: "var(--text-ink)"
      }
    }, code)),
    chat: /*#__PURE__*/React.createElement(IdePane, {
      flush: true,
      mono: false,
      title: "Agent"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "0 16px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        color: "var(--text-body)"
      }
    }, "Move session parsing into a middleware."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 8,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement(TimelinePill, {
      stage: "thinking"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 8,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement(TimelinePill, {
      stage: "grep"
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        color: "var(--text-muted)"
      }
    }, "kijun.session(")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 8,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement(TimelinePill, {
      stage: "read"
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        color: "var(--text-muted)"
      }
    }, "routes.ts")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 8,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement(TimelinePill, {
      stage: "edit"
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        color: "var(--text-muted)"
      }
    }, "+42 \u221216")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 8,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement(TimelinePill, {
      stage: "done"
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        color: "var(--text-muted)"
      }
    }, "3 files"))))),
    terminal: /*#__PURE__*/React.createElement(IdePane, {
      flush: true,
      title: "Terminal"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "0 16px",
        whiteSpace: "pre",
        color: "var(--text-body)"
      }
    }, "$ kijun run --repo .\n› indexed 1,284 files in 2.1s\n› 3 files changed, tests pass"))
  });
  const band = {
    maxWidth: "var(--container-max)",
    margin: "0 auto",
    padding: "var(--space-section) var(--space-lg)"
  };
  const label = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: ".88px",
    textTransform: "uppercase",
    color: "var(--text-muted)"
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(HeroBand, {
    headline: "The editor that reads your whole repo.",
    subhead: "Kijun plans, greps and edits across files \u2014 and shows every step it took.",
    onPrimary: () => go("Pricing"),
    onSecondary: () => go("Pricing"),
    mockup: mockup
  }), /*#__PURE__*/React.createElement("section", {
    style: {
      borderTop: "1px solid var(--hairline)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: band
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-xl)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-sm)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: label
  }, "Why Kijun"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 36,
      fontWeight: 400,
      letterSpacing: "-.72px",
      lineHeight: 1.2,
      color: "var(--text-ink)",
      margin: 0
    }
  }, "Context first, edits second.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: "var(--space-base)"
    }
  }, /*#__PURE__*/React.createElement(FeatureCard, {
    eyebrow: "Index",
    title: "Whole-repo context"
  }, "Every file is indexed locally, so the agent starts from your architecture instead of a snippet."), /*#__PURE__*/React.createElement(FeatureCard, {
    eyebrow: "Agent",
    title: "Multi-file edits"
  }, "One instruction, coordinated changes across routes, tests and config."), /*#__PURE__*/React.createElement(FeatureCard, {
    eyebrow: "Trace",
    title: "Shows its work"
  }, "Each run is a readable timeline of what was searched, read and changed."))))), /*#__PURE__*/React.createElement("section", {
    style: {
      borderTop: "1px solid var(--hairline)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: band
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "var(--space-lg)",
      alignItems: "start"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-sm)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: label
  }, "The timeline"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 36,
      fontWeight: 400,
      letterSpacing: "-.72px",
      lineHeight: 1.2,
      color: "var(--text-ink)",
      margin: 0
    }
  }, "Every run is legible."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 16,
      lineHeight: 1.5,
      letterSpacing: ".08px",
      color: "var(--text-body)",
      maxWidth: 460
    }
  }, "Five stages, five colours. You can read a fifty-step run at a glance and stop it at any point."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(TimelinePill, {
    stage: "thinking"
  }), /*#__PURE__*/React.createElement(TimelinePill, {
    stage: "grep"
  }), /*#__PURE__*/React.createElement(TimelinePill, {
    stage: "read"
  }), /*#__PURE__*/React.createElement(TimelinePill, {
    stage: "edit"
  }), /*#__PURE__*/React.createElement(TimelinePill, {
    stage: "done"
  }))), /*#__PURE__*/React.createElement(ComparisonCard, {
    title: "Where Kijun differs",
    leftItems: ["Indexes the whole repository", "Edits many files in one run", "Prints a stage-by-stage trace", "Runs your tests before it stops"],
    rightItems: ["Sees the open file", "Suggests one completion", "No record of what happened", "You verify by hand"]
  })))), /*#__PURE__*/React.createElement("section", {
    style: {
      borderTop: "1px solid var(--hairline)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: band
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-xl)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: "var(--space-base)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: label
  }, "Teams"), /*#__PURE__*/React.createElement(Badge, {
    tone: "outline"
  }, "1,200+ repos")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: "var(--space-base)"
    }
  }, /*#__PURE__*/React.createElement(TestimonialCard, {
    quote: "It reads the repo the way a teammate would \u2014 I stopped explaining context before every task.",
    name: "Dana Ruiz",
    role: "Staff engineer",
    company: "Northwind"
  }), /*#__PURE__*/React.createElement(TestimonialCard, {
    quote: "The trace is the feature. Reviewing an agent run finally feels like reviewing a diff.",
    name: "Ari Lund",
    role: "Platform lead",
    company: "Halcyon"
  }), /*#__PURE__*/React.createElement(TestimonialCard, {
    quote: "We moved a six-year-old service to the new auth flow in an afternoon.",
    name: "Priya Raman",
    role: "Principal engineer",
    company: "Ledgerly"
  }))))), /*#__PURE__*/React.createElement(CtaBand, {
    headline: "Try Kijun now",
    subhead: "Free to start. Point it at the repository you already have.",
    ctaLabel: "Get started",
    onCta: () => go("Pricing")
  }));
}
Object.assign(window, {
  HomeScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing_site/HomeScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing_site/PricingScreen.jsx
try { (() => {
function PricingScreen({
  go
}) {
  const {
    PricingTierCard,
    CtaBand,
    Badge
  } = window.KijunDesignSystem_7f1cd2;
  const band = {
    maxWidth: "var(--container-max)",
    margin: "0 auto",
    padding: "var(--space-section) var(--space-lg)"
  };
  const faqs = [["Does Kijun index my code in the cloud?", "The index is built locally by default. Team plans can opt into a shared index scoped to a repository."], ["What happens when I hit the run limit?", "Runs queue rather than fail. Pro and Business plans have no monthly cap."], ["Can I bring my own model keys?", "Yes, on Business and Enterprise. Keys stay on the machine that runs the agent."]];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("div", {
    style: {
      ...band,
      paddingBottom: "var(--space-xl)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-sm)",
      alignItems: "center",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement(Badge, null, "Pricing"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 36,
      fontWeight: 400,
      letterSpacing: "-.72px",
      lineHeight: 1.2,
      color: "var(--text-ink)",
      margin: 0
    }
  }, "Priced per engineer, not per token."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 16,
      lineHeight: 1.5,
      color: "var(--text-body)",
      maxWidth: 520
    }
  }, "Start free. Upgrade when the agent starts doing whole tasks for you.")))), /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("div", {
    style: {
      ...band,
      paddingTop: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: "var(--space-base)",
      alignItems: "stretch"
    }
  }, /*#__PURE__*/React.createElement(PricingTierCard, {
    name: "Hobby",
    price: "$0",
    period: "/month",
    description: "For side projects and evaluation.",
    features: ["50 agent runs per month", "Local repository index", "Community forum"],
    ctaLabel: "Download"
  }), /*#__PURE__*/React.createElement(PricingTierCard, {
    name: "Pro",
    price: "$20",
    period: "/month",
    description: "For individual engineers working daily.",
    features: ["Unlimited agent runs", "Whole-repo context", "Run history and traces", "Priority model capacity"],
    featured: true,
    ctaLabel: "Get Pro"
  }), /*#__PURE__*/React.createElement(PricingTierCard, {
    name: "Business",
    price: "$40",
    period: "/user/mo",
    description: "For teams sharing one codebase.",
    features: ["Everything in Pro", "Shared repository index", "SSO and audit log", "Bring your own model keys"],
    ctaLabel: "Contact sales",
    onCta: () => go("Enterprise")
  })))), /*#__PURE__*/React.createElement("section", {
    style: {
      borderTop: "1px solid var(--hairline)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: band
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "300px 1fr",
      gap: "var(--space-xxl)"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 26,
      fontWeight: 400,
      letterSpacing: "-.325px",
      lineHeight: 1.25,
      color: "var(--text-ink)",
      margin: 0
    }
  }, "Questions we get"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column"
    }
  }, faqs.map(([q, a]) => /*#__PURE__*/React.createElement("div", {
    key: q,
    style: {
      padding: "var(--space-lg) 0",
      borderBottom: "1px solid var(--hairline)",
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: "var(--text-ink)"
    }
  }, q), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      lineHeight: 1.5,
      color: "var(--text-body)",
      maxWidth: 620
    }
  }, a))))))), /*#__PURE__*/React.createElement(CtaBand, {
    headline: "Try Kijun now",
    subhead: "No card required for the Hobby plan.",
    ctaLabel: "Get started",
    onCta: () => go(null)
  }));
}
Object.assign(window, {
  PricingScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing_site/PricingScreen.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.TimelinePill = __ds_scope.TimelinePill;

__ds_ns.CodeBlock = __ds_scope.CodeBlock;

__ds_ns.IdeMockupCard = __ds_scope.IdeMockupCard;

__ds_ns.IdePane = __ds_scope.IdePane;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.ComparisonCard = __ds_scope.ComparisonCard;

__ds_ns.FeatureCard = __ds_scope.FeatureCard;

__ds_ns.PricingTierCard = __ds_scope.PricingTierCard;

__ds_ns.TestimonialCard = __ds_scope.TestimonialCard;

__ds_ns.TextInput = __ds_scope.TextInput;

__ds_ns.CtaBand = __ds_scope.CtaBand;

__ds_ns.HeroBand = __ds_scope.HeroBand;

__ds_ns.FooterLink = __ds_scope.FooterLink;

__ds_ns.Footer = __ds_scope.Footer;

__ds_ns.TopNav = __ds_scope.TopNav;

})();
