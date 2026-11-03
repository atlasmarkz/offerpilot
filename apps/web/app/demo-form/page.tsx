import type { Metadata } from "next";

// 公开的示例投递表单：用来体验浏览器扩展的填表功能，也方便应用商店审核人员测试。
// 不收集任何数据：没有提交逻辑，按钮不会发送任何请求。
export const metadata: Metadata = {
  title: "示例投递表单 · OfferPilot",
  description: "用来体验 OfferPilot 浏览器扩展填表功能的示例表单（演示用）",
  robots: { index: false },
};

const label: React.CSSProperties = { color: "#3b4350" };
const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  border: "1px solid #d5dbe5",
  borderRadius: 8,
  font: "inherit",
  color: "#1c2129",
  background: "#fff",
};

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ant-form-item" style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, alignItems: "center", marginBottom: 18 }}>
      <div className="ant-form-item-label">
        <label style={label}>
          <span style={{ color: "#d33" }}>* </span>
          {title}
        </label>
      </div>
      {children}
    </div>
  );
}

export default function DemoForm() {
  return (
    <main style={{ minHeight: "100vh", background: "#f4f6fb", color: "#1c2129" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e4e8f0", padding: "16px 48px", fontWeight: 700, fontSize: 18 }}>
        某某科技 · 2027 届校园招聘（演示）
      </div>
      <div style={{ maxWidth: 760, margin: "36px auto", background: "#fff", border: "1px solid #e4e8f0", borderRadius: 14, padding: "32px 40px" }}>
        <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>填写个人信息</h1>
        <p style={{ color: "#6b7482", margin: "0 0 24px" }}>
          这是示例投递表单，仅用于体验 OfferPilot 浏览器扩展的填表功能。这里不会收集或发送你填写的任何内容。
        </p>
        <form className="ant-form" onSubmit={(e) => e.preventDefault()}>
          <Row title="姓名">
            <input id="n" style={input} />
          </Row>
          <Row title="毕业院校">
            <input id="s" placeholder="请输入" style={input} />
          </Row>
          <Row title="专业">
            <input id="m" style={input} />
          </Row>
          <Row title="学历">
            <input id="d" readOnly placeholder="请选择" style={{ ...input, background: "#fafbfd", cursor: "pointer" }} />
          </Row>
          <Row title="手机号">
            <input id="p" placeholder="请输入手机号" style={input} />
          </Row>
          <button
            type="button"
            style={{ marginLeft: 122, padding: "11px 36px", background: "#3b5bdb", color: "#fff", border: 0, borderRadius: 8, font: "inherit", fontWeight: 600 }}
          >
            提交申请（演示，不会发送任何内容）
          </button>
          <p style={{ margin: "18px 0 0 122px", color: "#8792a6", fontSize: 13, lineHeight: 1.7 }}>
            使用方法：安装扩展后，点击浏览器工具栏里的扩展图标 → 若没有画像，点“用示例画像试用” → 点“填写当前页面”。
            扩展只会填入姓名、学校、专业；“学历”是自定义下拉，会提示你手动选择；手机号不会被填写。
          </p>
        </form>
      </div>
    </main>
  );
}
