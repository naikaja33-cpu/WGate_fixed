import{j as e}from"./query-GY_pS2ug.js";import{B as x}from"./badge-bGfLn8Rp.js";import{c as t,W as p,B as n}from"./index-D9xGZEEV.js";import{C as o}from"./calendar-D5VEJR-n.js";import{T as b}from"./trash-2-CoP4IF0G.js";import{f as r}from"./format-B7IyBU1l.js";/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=[["path",{d:"M12 7v14",key:"1akyts"}],["path",{d:"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",key:"ruj8y"}]],u=t("BookOpen",f);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]],g=t("FileText",y);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=[["path",{d:"m3 11 18-5v12L3 14v-3z",key:"n962bs"}],["path",{d:"M11.6 16.8a3 3 0 1 1-5.8-1.6",key:"1yl0tm"}]],v=t("Megaphone",j);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const N=[["path",{d:"M12 17v5",key:"bb1du9"}],["path",{d:"M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89",key:"znwnzq"}],["path",{d:"m2 2 20 20",key:"1ooewy"}],["path",{d:"M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11",key:"c9qhm2"}]],k=t("PinOff",N);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const M=[["path",{d:"M12 17v5",key:"bb1du9"}],["path",{d:"M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z",key:"1nkz8b"}]],l=t("Pin",M),d={announcement:{label:"Announcement",icon:v,color:"bg-blue-100 text-blue-700 border-blue-200"},rule:{label:"Rule",icon:u,color:"bg-purple-100 text-purple-700 border-purple-200"},event:{label:"Event",icon:o,color:"bg-emerald-100 text-emerald-700 border-emerald-200"},maintenance:{label:"Maintenance",icon:p,color:"bg-amber-100 text-amber-700 border-amber-200"},other:{label:"Other",icon:g,color:"bg-muted text-muted-foreground border-border"}};function C({notice:a,isAdmin:i,onDelete:c,onTogglePin:m}){const s=d[a.type]||d.other,h=s.icon;return e.jsxs("div",{className:`bg-card rounded-2xl border p-4 space-y-2 transition-all hover:shadow-md ${a.is_pinned?"border-primary/30 bg-accent/20":"border-border"}`,children:[e.jsxs("div",{className:"flex items-start justify-between gap-2",children:[e.jsxs("div",{className:"flex items-start gap-2 flex-1 min-w-0",children:[e.jsx("div",{className:`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${s.color.split(" ").slice(0,2).join(" ")}`,children:e.jsx(h,{className:"w-4 h-4"})}),e.jsxs("div",{className:"flex-1 min-w-0",children:[e.jsx("h3",{className:"font-semibold text-foreground text-sm leading-tight",children:a.title}),e.jsxs("div",{className:"flex items-center gap-2 mt-1 flex-wrap",children:[e.jsx(x,{className:`text-xs border ${s.color}`,children:s.label}),a.is_pinned&&e.jsxs("span",{className:"flex items-center gap-0.5 text-xs text-primary font-medium",children:[e.jsx(l,{className:"w-3 h-3"})," Pinned"]})]})]})]}),i&&e.jsxs("div",{className:"flex items-center gap-1 flex-shrink-0",children:[e.jsx(n,{size:"icon",variant:"ghost",className:"h-7 w-7 text-muted-foreground hover:text-primary",onClick:m,title:a.is_pinned?"Unpin":"Pin",children:a.is_pinned?e.jsx(k,{className:"w-3.5 h-3.5"}):e.jsx(l,{className:"w-3.5 h-3.5"})}),e.jsx(n,{size:"icon",variant:"ghost",className:"h-7 w-7 text-muted-foreground hover:text-destructive",onClick:c,children:e.jsx(b,{className:"w-3.5 h-3.5"})})]})]}),e.jsx("p",{className:"text-sm text-muted-foreground leading-relaxed pl-10",children:a.content}),e.jsxs("div",{className:"flex items-center justify-between pl-10 text-xs text-muted-foreground",children:[e.jsxs("span",{children:["By ",a.posted_by||"Admin"]}),e.jsxs("div",{className:"flex items-center gap-3",children:[a.event_date&&e.jsxs("span",{className:"flex items-center gap-1 text-emerald-600 font-medium",children:[e.jsx(o,{className:"w-3 h-3"})," ",r(new Date(a.event_date),"MMM d, yyyy")]}),e.jsx("span",{children:a.created_date?r(new Date(a.created_date),"MMM d"):""})]})]})]})}export{C as N,l as P};
