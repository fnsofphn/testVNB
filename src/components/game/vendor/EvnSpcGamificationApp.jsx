import { useState, useEffect, useMemo } from "react";

/* ═══════════════════════════════════════════════════
   DATA: 5 Mechanisms with detailed principles
   ═══════════════════════════════════════════════════ */
const MECHANISMS = [
  {
    id: "rhythm", name: "Nhịp Điều hành", icon: "🎵", tag: "Ngày–Tuần–Tháng",
    color: "#8b5cf6", desc: "Thiết lập nhịp vận hành ổn định để đơn vị tự vận hành, không phụ thuộc một người",
    withoutTxt: "Trưởng ĐL đi vắng → đơn vị chao đảo, ai nhớ thì làm",
    withTxt: "Trưởng ĐL đi vắng → đơn vị vẫn vận hành theo nhịp chuẩn",
    principles: [
      { name: "Giao ban có cấu trúc cố định", detail: "Luôn có 4 mục: việc tồn, việc mới, TNKH, an toàn. Không tùy hứng.", example: "Trưởng ĐL X: giao ban từ 35 phút \"ai có gì nói nấy\" → còn 15 phút với mẫu 4 mục, mỗi việc có tên + hạn.", mgmt: 9, cx: 7 },
      { name: "Giao ban có mục TNKH", detail: "Mỗi ngày 1 câu hỏi: \"Hôm nay KH đang cảm nhận gì?\" — kiểm tra phiếu tồn, phàn nàn.", example: "Tổ trưởng CSKH báo: \"3 phiếu tồn >48h\" → Trưởng ĐL chốt ngay ai xử lý, hạn trước 14h.", mgmt: 7, cx: 10 },
      { name: "Nhịp Tuần rà soát phối hợp liên tổ", detail: "Mỗi tuần kiểm tra: việc liên tổ có đang nghẽn ở đâu không?", example: "2 yêu cầu cấp điện chậm vì tổ KD lập hồ sơ xong nhưng tổ KT chưa biết → chốt: chuyển trên VPĐT trong ngày.", mgmt: 9, cx: 8 },
      { name: "Tháng có đánh giá + điều chỉnh", detail: "Cuối tháng nhìn lại: việc tồn, phối hợp nghẽn, KH phàn nàn gì → điều chỉnh.", example: "60% phàn nàn liên quan phản hồi chậm → tháng sau: mọi phản ánh KH phải có phản hồi lần đầu trong 4 giờ.", mgmt: 8, cx: 9 },
    ],
  },
  {
    id: "assign", name: "Phân công & Chỉ đạo", icon: "📋", tag: "Rõ việc–Rõ người–Rõ hạn",
    color: "#3b82f6", desc: "Mỗi đầu việc đều có người chịu trách nhiệm rõ, đầu ra rõ, thời hạn rõ, cách báo lại rõ",
    withoutTxt: "Việc liên tổ không ai chủ trì → chồng chéo, đùn đẩy, KH rơi vào vùng xám",
    withTxt: "Mỗi việc có tam giác trách nhiệm, KH luôn có 1 đầu mối duy nhất",
    principles: [
      { name: "Giao việc kèm đầu ra + thời hạn + cách báo lại", detail: "Không nói \"anh xử lý\". Phải chốt: kết quả gì, khi nào, báo lại bằng gì.", example: "\"Anh B kiểm tra sự cố ấp X — đầu ra: ảnh + đề xuất, trước 14h, báo trên Zalo tổ KT.\"", mgmt: 10, cx: 7 },
      { name: "Tam giác trách nhiệm cho việc liên tổ", detail: "Ai chủ trì – Ai phối hợp – Ai phản hồi KH. Xóa vùng xám.", example: "Cấp điện mới: Chủ trì = tổ KD (anh C), Phối hợp = tổ KT (anh D khảo sát), Phản hồi KH = anh C.", mgmt: 10, cx: 9 },
      { name: "Ma trận phân công theo loại việc + địa bàn", detail: "Bảng phân công sẵn: ai phụ trách địa bàn nào, loại việc nào thuộc tổ nào.", example: "4 xã, 3 tổ → Bảng: Xã A+B = Tổ 1, Xã C = Tổ 2, Xã D = Tổ 3. Sự cố liên địa bàn → Tổ 1 chủ trì.", mgmt: 9, cx: 8 },
    ],
  },
  {
    id: "control", name: "Kiểm soát nhẹ", icon: "🔍", tag: "Tin tưởng–Kiểm tra",
    color: "#f59e0b", desc: "Kiểm soát chất lượng mà không mất nhiều thời gian theo dõi cấp dưới từng bước",
    withoutTxt: "Hoặc quá chặt (mất thời gian) hoặc quá lỏng (mất chất lượng)",
    withTxt: "Kiểm soát đúng việc, đúng thời điểm — giảm 40-50% thời gian kiểm tra",
    principles: [
      { name: "Kiểm soát bằng \"điểm chốt\"", detail: "Xác định 3–5 điểm chốt quan trọng. Chỉ kiểm tra tại điểm chốt, không giám sát từng bước.", example: "Cấp điện mới 10 bước → Chỉ kiểm 4 điểm: hồ sơ đủ? khảo sát đúng hạn? thi công an toàn? KH xác nhận?", mgmt: 10, cx: 7 },
      { name: "Cơ chế đèn xanh/đỏ báo cáo ngoại lệ", detail: "Bình thường = đèn xanh (1 dòng \"hoàn thành\"). Vướng mắc = đèn đỏ (báo chi tiết). Trưởng ĐL chỉ xử lý đèn đỏ.", example: "Giao ban: Tổ trưởng nói \"Đèn xanh\" hoặc \"Đèn đỏ: phiếu 123 vướng KH thiếu giấy tờ\" → 45 phút xuống 15 phút.", mgmt: 10, cx: 6 },
      { name: "Spot-check ngẫu nhiên", detail: "Mỗi tuần chọn ngẫu nhiên 2–3 việc đã hoàn thành để kiểm tra. Không báo trước.", example: "Kiểm tra 2 phiếu sự cố đã đóng → 1 phiếu chưa gọi KH xác nhận → phản hồi ngay cho Tổ trưởng.", mgmt: 8, cx: 8 },
    ],
  },
  {
    id: "cx", name: "Trải nghiệm KH", icon: "💎", tag: "La bàn điều hành",
    color: "#10b981", desc: "Gắn TNKH vào nhịp điều hành hàng ngày — biến từ \"chỉ tiêu bị động\" thành \"la bàn chủ động\"",
    withoutTxt: "TNKH coi là việc của tổ KD/CSKH, 70% phàn nàn do không được thông báo",
    withTxt: "Mỗi quyết định điều hành được kiểm tra qua lăng kính KH, giảm 50%+ phàn nàn",
    principles: [
      { name: "Báo lại KH trước khi KH hỏi", detail: "Quá hạn → chủ động liên hệ KH trước. \"KH không bao giờ phải gọi hỏi tiến độ lần thứ 2.\"", example: "Sự cố hẹn 2h, sẽ chậm → gọi KH: \"Phức tạp hơn dự kiến, thêm 1h nữa, em sẽ cập nhật tiếp.\" → bớt bức xúc 80%.", mgmt: 6, cx: 10 },
      { name: "Chốt đầu mối xuyên suốt cho hành trình KH", detail: "Mỗi yêu cầu KH liên tổ → 1 người duy nhất liên hệ KH từ đầu đến cuối.", example: "KH cấp điện mới → anh C là đầu mối: \"Hồ sơ đủ, mai KT khảo sát, thứ 5 đóng điện.\" KH chỉ nhớ 1 số.", mgmt: 7, cx: 10 },
      { name: "\"Ngày trải nghiệm KH\" mỗi quý", detail: "Trưởng/Phó ĐL gọi tổng đài với tư cách KH hoặc quan sát nhân viên phục vụ, không báo trước.", example: "Phó ĐL gọi tổng đài hỏi tiền điện tăng → phát hiện NV trả lời \"theo quy định...\" thay vì đồng cảm trước.", mgmt: 6, cx: 9 },
    ],
  },
  {
    id: "evaluate", name: "Đánh giá & Ghi nhận", icon: "⭐", tag: "Kịp thời–Toàn diện",
    color: "#ef4444", desc: "Đánh giá đúng, ghi nhận kịp thời, tạo động lực bền vững cho đội ngũ",
    withoutTxt: "Đánh giá chỉ theo KPI số, ghi nhận chậm (cuối tháng/quý), nhân viên không biết đúng/sai",
    withTxt: "Đánh giá kép KPI + hành vi KH, ghi nhận trong 24h — đội ngũ tự điều chỉnh",
    principles: [
      { name: "Ghi nhận ngay tại chỗ — trong 24 giờ", detail: "NV làm tốt → ghi nhận ngay: nói trước tổ, nhắn tin, nêu tên trong giao ban. Không chờ cuối tháng.", example: "NV E chủ động gọi KH thông báo tiến độ → Trưởng ĐL nói ngay trong giao ban: \"Đây là cách làm chuẩn.\"", mgmt: 8, cx: 8 },
      { name: "Đánh giá kép: KPI vận hành + Hành vi KH", detail: "Bổ sung tiêu chí TNKH: thời gian phản hồi, phiếu tồn quá hạn, số lần KH phải gọi lại.", example: "Tổ A: KPI 95% nhưng 3 phiếu tồn >72h. Tổ B: KPI 90% nhưng 0 phiếu tồn, KH khen → Tổ B đánh giá cao hơn.", mgmt: 7, cx: 10 },
      { name: "Phản hồi cải thiện — ngắn, rõ, đúng việc", detail: "Nói rõ hành vi sai (không phê phán con người), chỉ cách đúng, hẹn kiểm tra lại.", example: "\"Phiếu 456 em đóng nhưng chưa gọi KH. Lần sau: đóng phiếu = gọi KH trước. Chiều nay em gọi lại nhé.\"", mgmt: 8, cx: 9 },
    ],
  },
];

const QUIZ = [
  { scenario: "Sáng thứ Hai, anh/chị đến cơ quan thấy 6 tin nhắn Zalo từ cấp dưới hỏi ý kiến về những việc lặt vặt. Anh/chị nên áp dụng cơ chế nào?", answer: "assign", explain: "Quy định rõ danh mục việc cấp dưới tự quyết / việc phải hỏi → giảm tin nhắn vặt." },
  { scenario: "KH gọi phàn nàn lần thứ 3 về cấp điện mới chậm. Mỗi lần gọi phải kể lại từ đầu vì mỗi lần một người tiếp nhận khác nhau.", answer: "cx", explain: "Chốt đầu mối xuyên suốt: 1 người duy nhất liên hệ KH từ đầu → KH không phải kể lại." },
  { scenario: "Anh/chị muốn kiểm soát chất lượng nhưng thấy mình đang mất 2–3 giờ mỗi ngày để đọc lại mọi báo cáo và kiểm tra từng số liệu.", answer: "control", explain: "Áp dụng kiểm soát bằng 'điểm chốt' + báo cáo ngoại lệ (đèn xanh/đỏ) → giảm 40–50% thời gian kiểm tra." },
  { scenario: "Nhân viên xử lý sự cố nhanh và được KH khen. Nhưng anh/chị chờ đến cuối tháng mới đề cập trong báo cáo đánh giá.", answer: "evaluate", explain: "Ghi nhận ngay trong 24h: nêu tên trong giao ban sáng hôm sau → tạo động lực lan tỏa tức thì." },
  { scenario: "Anh/chị đi họp huyện 2 ngày. Khi về, đơn vị có 5 việc tồn, 2 phiếu KH không ai xử lý, tổ kỹ thuật và tổ kinh doanh đổ lỗi cho nhau.", answer: "rhythm", explain: "Khi có nhịp Ngày-Tuần-Tháng chuẩn, Phó ĐL chủ trì giao ban theo mẫu → đơn vị vẫn vận hành khi Trưởng ĐL vắng." },
];

const IMPACT_TABLE = [
  { aspect: "Giảm nhắc việc lặp lại 60–70%", mechs: ["assign", "rhythm"] },
  { aspect: "Giảm thời gian họp/báo cáo 40–50%", mechs: ["control", "rhythm"] },
  { aspect: "Giảm việc tồn & chồng chéo", mechs: ["assign", "control"] },
  { aspect: "Tăng tốc phản hồi KH", mechs: ["cx", "rhythm"] },
  { aspect: "Tăng chủ động đội ngũ", mechs: ["evaluate", "control"] },
  { aspect: "Nâng cảm nhận KH tại điểm chạm", mechs: ["cx", "evaluate"] },
  { aspect: "Đơn vị tự vận hành khi TĐL vắng", mechs: ["rhythm", "assign"] },
];

/* ═══════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════ */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600;700;800;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Be Vietnam Pro', sans-serif; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.6; } }
  @keyframes glow { 0%,100% { box-shadow:0 0 12px rgba(16,185,129,.3); } 50% { box-shadow:0 0 28px rgba(16,185,129,.6); } }
  @keyframes slideRight { from { width:0; } }
  .fade-up { animation: fadeUp .5s ease-out both; }
  .card-hover { transition: all .25s; }
  .card-hover:hover { transform: translateY(-3px); }
  input[type="range"] { -webkit-appearance:none; width:100%; height:6px; border-radius:3px; outline:none; background:rgba(255,255,255,.1); }
  input[type="range"]::-webkit-slider-thumb { -webkit-appearance:none; width:18px; height:18px; border-radius:50%; cursor:pointer; border:2px solid #fff; }
`;

/* ═══════════════════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════════════════ */
const bg = "linear-gradient(145deg, #0c0c1d 0%, #141432 40%, #0e1628 100%)";

function Toggle({ on, onToggle, color }) {
  return (
    <button onClick={onToggle} style={{ width:48, height:26, borderRadius:13, border:"none", background: on ? color : "rgba(255,255,255,.15)", cursor:"pointer", position:"relative", transition:"background .3s", flexShrink:0 }}>
      <div style={{ width:20, height:20, borderRadius:"50%", background:"#fff", position:"absolute", top:3, left: on ? 25 : 3, transition:"left .3s", boxShadow:"0 1px 4px rgba(0,0,0,.3)" }} />
    </button>
  );
}

function ScoreBar({ label, icon, pct, color }) {
  return (
    <div style={{ flex:1 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
        <span style={{ fontSize:11, color:"#8899bb", fontWeight:600, textTransform:"uppercase", letterSpacing:1 }}>{icon} {label}</span>
        <span style={{ fontSize:22, fontWeight:900, color }}>{pct}%</span>
      </div>
      <div style={{ height:8, background:"rgba(255,255,255,.08)", borderRadius:4, overflow:"hidden" }}>
        <div style={{ width:`${pct}%`, height:"100%", background:`linear-gradient(90deg, ${color}88, ${color})`, borderRadius:4, transition:"width .6s ease" }} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   INSTRUCTOR MODE
   ═══════════════════════════════════════════════════ */
function InstructorMode({ onBack }) {
  const [active, setActive] = useState(new Set());
  const [expanded, setExpanded] = useState(null);
  const [showTable, setShowTable] = useState(false);

  const toggle = id => setActive(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const scores = useMemo(() => {
    const ms = MECHANISMS.filter(m => active.has(m.id)).flatMap(m => m.principles);
    const all = MECHANISMS.flatMap(m => m.principles);
    const mgmt = ms.reduce((s,p) => s+p.mgmt, 0);
    const cx = ms.reduce((s,p) => s+p.cx, 0);
    const maxM = all.reduce((s,p) => s+p.mgmt, 0);
    const maxC = all.reduce((s,p) => s+p.cx, 0);
    return { mgmt: Math.round(mgmt/maxM*100), cx: Math.round(cx/maxC*100) };
  }, [active]);

  const n = active.size;
  const grade = n===0?"—":n<=2?"C":n<=3?"B":n<=4?"A":"S+";
  const gc = n===0?"#555":n<=2?"#f59e0b":n<=3?"#eab308":n<=4?"#22c55e":"#10b981";

  return (
    <div style={{ minHeight:"100vh", background:bg, padding:"16px 16px 40px", color:"#e0e8f8" }}>
      <div style={{ maxWidth:1100, margin:"0 auto" }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <button onClick={onBack} style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", color:"#8899bb", padding:"6px 14px", borderRadius:8, cursor:"pointer", fontSize:12 }}>← Về trang chính</button>
          <div style={{ fontSize:11, color:"#556688", background:"rgba(255,255,255,.04)", padding:"4px 12px", borderRadius:20 }}>👨‍🏫 CHẾ ĐỘ GIẢNG VIÊN</div>
        </div>

        <h1 style={{ textAlign:"center", fontSize:"clamp(18px,4vw,26px)", fontWeight:800, marginBottom:4 }}>🎯 5 CƠ CHẾ ĐIỀU HÀNH KÉP</h1>
        <p style={{ textAlign:"center", fontSize:13, color:"#667799", marginBottom:24 }}>Bật/tắt từng cơ chế → Quan sát tác động kép lên Quản lý & TNKH</p>

        {/* Scores + Grade */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:16, alignItems:"center", marginBottom:24 }}>
          <ScoreBar label="Hiệu quả Quản lý" icon="📊" pct={scores.mgmt} color="#3b82f6" />
          <div style={{ width:68, height:68, borderRadius:"50%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", border:`3px solid ${gc}`, background:`${gc}15`, animation: n===5 ? "glow 2s infinite" : "none" }}>
            <div style={{ fontSize:22, fontWeight:900, color:gc, lineHeight:1 }}>{grade}</div>
            <div style={{ fontSize:9, color:"#8899bb" }}>{n}/5</div>
          </div>
          <ScoreBar label="Trải nghiệm KH" icon="💎" pct={scores.cx} color="#10b981" />
        </div>

        {/* Mechanism Cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(190px, 1fr))", gap:12, marginBottom:20 }}>
          {MECHANISMS.map((m, i) => {
            const on = active.has(m.id);
            const sel = expanded === m.id;
            return (
              <div key={m.id} className="card-hover fade-up" style={{ animationDelay:`${i*.07}s`, background: on ? `${m.color}18` : "rgba(255,255,255,.03)", borderRadius:14, padding:14, border:`2px solid ${on ? m.color : "rgba(255,255,255,.07)"}`, cursor:"pointer" }} onClick={() => setExpanded(sel ? null : m.id)}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <span style={{ fontSize:22 }}>{m.icon}</span>
                  <Toggle on={on} onToggle={e => { e?.stopPropagation?.(); toggle(m.id); }} color={m.color} />
                </div>
                <div style={{ fontSize:13, fontWeight:700, color: on ? m.color : "#9aa4bb", marginBottom:3 }}>{m.name}</div>
                <div style={{ fontSize:10, color:"#667799", lineHeight:1.5 }}>{m.tag}</div>
              </div>
            );
          })}
        </div>

        {/* Expanded Detail */}
        {expanded && (() => {
          const m = MECHANISMS.find(x => x.id === expanded);
          return (
            <div className="fade-up" style={{ background:`${m.color}08`, borderRadius:16, padding:20, marginBottom:20, border:`1px solid ${m.color}25` }}>
              <h3 style={{ color:m.color, fontSize:15, fontWeight:700, marginBottom:4 }}>{m.icon} {m.name}</h3>
              <p style={{ fontSize:12, color:"#8899bb", marginBottom:16, lineHeight:1.6 }}>{m.desc}</p>

              {/* Before/After */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
                <div style={{ background:"rgba(239,68,68,.08)", borderRadius:10, padding:10, border:"1px solid rgba(239,68,68,.15)" }}>
                  <div style={{ fontSize:10, color:"#ef4444", fontWeight:700, marginBottom:4 }}>❌ KHÔNG CÓ CƠ CHẾ</div>
                  <div style={{ fontSize:11, color:"#aab0cc", lineHeight:1.6 }}>{m.withoutTxt}</div>
                </div>
                <div style={{ background:"rgba(16,185,129,.08)", borderRadius:10, padding:10, border:"1px solid rgba(16,185,129,.15)" }}>
                  <div style={{ fontSize:10, color:"#10b981", fontWeight:700, marginBottom:4 }}>✅ CÓ CƠ CHẾ</div>
                  <div style={{ fontSize:11, color:"#aab0cc", lineHeight:1.6 }}>{m.withTxt}</div>
                </div>
              </div>

              {/* Principles */}
              <div style={{ fontSize:11, color:"#667799", fontWeight:600, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>Nguyên tắc cốt lõi</div>
              {m.principles.map((p, i) => (
                <div key={i} style={{ background:"rgba(0,0,0,.2)", borderRadius:10, padding:12, marginBottom:8, border:"1px solid rgba(255,255,255,.05)" }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#d0d8f0", marginBottom:4 }}>NT{i+1}: {p.name}</div>
                  <div style={{ fontSize:11, color:"#8899bb", lineHeight:1.6, marginBottom:6 }}>{p.detail}</div>
                  <div style={{ fontSize:11, color:`${m.color}cc`, fontStyle:"italic", lineHeight:1.5, marginBottom:8, paddingLeft:10, borderLeft:`2px solid ${m.color}44` }}>💡 {p.example}</div>
                  <div style={{ display:"flex", gap:12 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:9, color:"#3b82f6", marginBottom:2, fontWeight:600 }}>Quản lý: {p.mgmt}/10</div>
                      <div style={{ height:3, background:"rgba(255,255,255,.08)", borderRadius:2, overflow:"hidden" }}>
                        <div style={{ width:`${p.mgmt*10}%`, height:"100%", background:"#3b82f6", borderRadius:2 }} />
                      </div>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:9, color:"#10b981", marginBottom:2, fontWeight:600 }}>TNKH: {p.cx}/10</div>
                      <div style={{ height:3, background:"rgba(255,255,255,.08)", borderRadius:2, overflow:"hidden" }}>
                        <div style={{ width:`${p.cx*10}%`, height:"100%", background:"#10b981", borderRadius:2 }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Impact Table Toggle */}
        <div style={{ textAlign:"center", marginBottom:12 }}>
          <button onClick={() => setShowTable(!showTable)} style={{ background:"rgba(255,255,255,.05)", color:"#8899bb", border:"1px solid rgba(255,255,255,.1)", padding:"8px 20px", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:600 }}>
            {showTable ? "Ẩn" : "Xem"} bảng tác động ↕
          </button>
        </div>

        {showTable && (
          <div className="fade-up" style={{ background:"rgba(255,255,255,.02)", borderRadius:14, padding:14, border:"1px solid rgba(255,255,255,.06)", overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
              <thead>
                <tr>
                  <th style={{ padding:"6px 8px", textAlign:"left", color:"#667799", borderBottom:"1px solid rgba(255,255,255,.08)" }}>Kết quả</th>
                  {MECHANISMS.map(m => <th key={m.id} style={{ padding:"6px 4px", textAlign:"center", color: active.has(m.id)?m.color:"#444", borderBottom:"1px solid rgba(255,255,255,.08)", fontSize:10 }}>{m.icon}</th>)}
                  <th style={{ padding:"6px 4px", textAlign:"center", color:"#10b981", borderBottom:"1px solid rgba(255,255,255,.08)", fontSize:10 }}>Đạt?</th>
                </tr>
              </thead>
              <tbody>
                {IMPACT_TABLE.map((row, i) => {
                  const ok = row.mechs.every(id => active.has(id));
                  const partial = row.mechs.some(id => active.has(id));
                  return (
                    <tr key={i} style={{ background: ok ? "rgba(16,185,129,.05)" : "transparent" }}>
                      <td style={{ padding:"6px 8px", color:"#bbc4dd", borderBottom:"1px solid rgba(255,255,255,.04)" }}>{row.aspect}</td>
                      {MECHANISMS.map(m => <td key={m.id} style={{ padding:"6px 4px", textAlign:"center", borderBottom:"1px solid rgba(255,255,255,.04)", fontSize:14 }}>{row.mechs.includes(m.id) ? (active.has(m.id) ? "✅" : "⬜") : "·"}</td>)}
                      <td style={{ padding:"6px 4px", textAlign:"center", borderBottom:"1px solid rgba(255,255,255,.04)", fontWeight:700, color: ok ? "#10b981" : partial ? "#f59e0b" : "#444", fontSize:11 }}>{ok?"✓ Đạt":partial?"~ 1 phần":"✗"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   STUDENT MODE
   ═══════════════════════════════════════════════════ */
function StudentMode({ onBack }) {
  const [tab, setTab] = useState("explore"); // explore, quiz, assess, results
  const [expandedM, setExpandedM] = useState(null);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState([]);
  const [quizSelected, setQuizSelected] = useState(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [assessments, setAssessments] = useState(MECHANISMS.reduce((a,m) => ({...a,[m.id]:1}),{}));

  const quizScore = quizAnswers.filter((a,i) => a === QUIZ[i].answer).length;
  const assessAvg = Object.values(assessments).reduce((s,v)=>s+v,0) / 5;

  const tabs = [
    { id:"explore", label:"🔍 Khám phá", desc:"5 cơ chế" },
    { id:"quiz", label:"⚡ Thử thách", desc:"Tình huống" },
    { id:"assess", label:"📊 Tự đánh giá", desc:"Đơn vị tôi" },
    { id:"results", label:"🏆 Kết quả", desc:"Điểm số" },
  ];

  function submitQuiz() {
    setQuizSubmitted(true);
    setQuizAnswers(prev => { const n = [...prev]; n[quizIdx] = quizSelected; return n; });
  }

  function nextQuiz() {
    if (quizIdx < QUIZ.length - 1) {
      setQuizIdx(quizIdx + 1);
      setQuizSelected(null);
      setQuizSubmitted(false);
    } else {
      setTab("assess");
    }
  }

  return (
    <div style={{ minHeight:"100vh", background:bg, padding:"16px 16px 40px", color:"#e0e8f8" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth:900, margin:"0 auto" }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <button onClick={onBack} style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", color:"#8899bb", padding:"6px 14px", borderRadius:8, cursor:"pointer", fontSize:12 }}>← Về</button>
          <div style={{ fontSize:11, color:"#556688", background:"rgba(255,255,255,.04)", padding:"4px 12px", borderRadius:20 }}>🎓 HỌC VIÊN</div>
        </div>

        <h1 style={{ textAlign:"center", fontSize:"clamp(16px,3.5vw,22px)", fontWeight:800, marginBottom:20 }}>🎯 5 Cơ chế Điều hành Kép — Học tập tương tác</h1>

        {/* Tabs */}
        <div style={{ display:"flex", gap:6, marginBottom:24, flexWrap:"wrap", justifyContent:"center" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding:"8px 16px", borderRadius:10, border: tab===t.id ? "2px solid #10b981" : "1px solid rgba(255,255,255,.1)",
              background: tab===t.id ? "rgba(16,185,129,.12)" : "rgba(255,255,255,.03)",
              color: tab===t.id ? "#10b981" : "#8899bb", cursor:"pointer", fontSize:12, fontWeight:600,
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── EXPLORE TAB ── */}
        {tab === "explore" && (
          <div>
            <p style={{ textAlign:"center", fontSize:13, color:"#667799", marginBottom:20 }}>Nhấn vào từng cơ chế để khám phá chi tiết nguyên tắc và ví dụ thực tế</p>
            {MECHANISMS.map((m, i) => (
              <div key={m.id} className="fade-up card-hover" style={{ animationDelay:`${i*.08}s`, background: expandedM===m.id ? `${m.color}10` : "rgba(255,255,255,.03)", borderRadius:14, padding:16, marginBottom:10, border:`1px solid ${expandedM===m.id ? m.color+"40" : "rgba(255,255,255,.07)"}`, cursor:"pointer" }} onClick={() => setExpandedM(expandedM===m.id ? null : m.id)}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <span style={{ fontSize:28 }}>{m.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:m.color }}>{m.name}</div>
                    <div style={{ fontSize:11, color:"#8899bb", marginTop:2 }}>{m.desc}</div>
                  </div>
                  <span style={{ fontSize:16, color:"#556688" }}>{expandedM===m.id ? "▲" : "▼"}</span>
                </div>
                {expandedM === m.id && (
                  <div style={{ marginTop:14 }} onClick={e => e.stopPropagation()}>
                    {/* Before/After */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
                      <div style={{ background:"rgba(239,68,68,.06)", borderRadius:8, padding:8, fontSize:11, lineHeight:1.6 }}>
                        <span style={{ color:"#ef4444", fontWeight:700 }}>❌ Không có:</span> <span style={{ color:"#99a0bb" }}>{m.withoutTxt}</span>
                      </div>
                      <div style={{ background:"rgba(16,185,129,.06)", borderRadius:8, padding:8, fontSize:11, lineHeight:1.6 }}>
                        <span style={{ color:"#10b981", fontWeight:700 }}>✅ Có:</span> <span style={{ color:"#99a0bb" }}>{m.withTxt}</span>
                      </div>
                    </div>
                    {m.principles.map((p, j) => (
                      <div key={j} style={{ background:"rgba(0,0,0,.15)", borderRadius:10, padding:12, marginBottom:6 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:"#d0d8f0", marginBottom:4 }}>Nguyên tắc {j+1}: {p.name}</div>
                        <div style={{ fontSize:11, color:"#8899bb", lineHeight:1.6, marginBottom:6 }}>{p.detail}</div>
                        <div style={{ fontSize:11, color:`${m.color}bb`, fontStyle:"italic", lineHeight:1.5, paddingLeft:8, borderLeft:`2px solid ${m.color}33` }}>💡 {p.example}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── QUIZ TAB ── */}
        {tab === "quiz" && (
          <div className="fade-up">
            <div style={{ textAlign:"center", marginBottom:16 }}>
              <div style={{ fontSize:12, color:"#667799", marginBottom:4 }}>Tình huống {quizIdx+1} / {QUIZ.length}</div>
              <div style={{ display:"flex", gap:4, justifyContent:"center" }}>
                {QUIZ.map((_,i) => <div key={i} style={{ width:32, height:4, borderRadius:2, background: i<quizIdx ? (quizAnswers[i]===QUIZ[i].answer?"#10b981":"#ef4444") : i===quizIdx ? "#3b82f6" : "rgba(255,255,255,.1)" }} />)}
              </div>
            </div>

            <div style={{ background:"rgba(255,255,255,.04)", borderRadius:14, padding:20, border:"1px solid rgba(255,255,255,.08)", marginBottom:16 }}>
              <div style={{ fontSize:13, color:"#d0d8f0", lineHeight:1.7, marginBottom:16 }}>📌 {QUIZ[quizIdx].scenario}</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {MECHANISMS.map(m => {
                  const isCorrect = QUIZ[quizIdx].answer === m.id;
                  const isSelected = quizSelected === m.id;
                  let bg2 = "rgba(255,255,255,.04)";
                  let bc = "rgba(255,255,255,.08)";
                  if (quizSubmitted && isCorrect) { bg2 = "rgba(16,185,129,.12)"; bc = "#10b981"; }
                  else if (quizSubmitted && isSelected && !isCorrect) { bg2 = "rgba(239,68,68,.12)"; bc = "#ef4444"; }
                  else if (isSelected) { bg2 = `${m.color}15`; bc = m.color; }
                  return (
                    <button key={m.id} onClick={() => !quizSubmitted && setQuizSelected(m.id)} disabled={quizSubmitted} style={{ background:bg2, border:`2px solid ${bc}`, borderRadius:10, padding:"10px 12px", cursor: quizSubmitted ? "default" : "pointer", textAlign:"left", display:"flex", alignItems:"center", gap:8, opacity: quizSubmitted && !isCorrect && !isSelected ? .4 : 1, transition:"all .2s" }}>
                      <span style={{ fontSize:20 }}>{m.icon}</span>
                      <span style={{ fontSize:12, fontWeight:600, color: isSelected ? m.color : "#99a4bb" }}>{m.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {quizSubmitted && (
              <div className="fade-up" style={{ background: quizSelected===QUIZ[quizIdx].answer ? "rgba(16,185,129,.08)" : "rgba(239,68,68,.08)", borderRadius:12, padding:14, marginBottom:16, border:`1px solid ${quizSelected===QUIZ[quizIdx].answer ? "rgba(16,185,129,.2)" : "rgba(239,68,68,.2)"}` }}>
                <div style={{ fontSize:13, fontWeight:700, color: quizSelected===QUIZ[quizIdx].answer ? "#10b981" : "#ef4444", marginBottom:4 }}>
                  {quizSelected===QUIZ[quizIdx].answer ? "✅ Chính xác!" : "❌ Chưa đúng"}
                </div>
                <div style={{ fontSize:12, color:"#99a4bb", lineHeight:1.6 }}>{QUIZ[quizIdx].explain}</div>
              </div>
            )}

            <div style={{ display:"flex", justifyContent:"center", gap:10 }}>
              {!quizSubmitted ? (
                <button onClick={submitQuiz} disabled={!quizSelected} style={{ padding:"10px 28px", borderRadius:10, border:"none", background: quizSelected ? "#10b981" : "#333", color: quizSelected ? "#0c0c1d" : "#666", cursor: quizSelected ? "pointer" : "default", fontSize:13, fontWeight:700 }}>Kiểm tra</button>
              ) : (
                <button onClick={nextQuiz} style={{ padding:"10px 28px", borderRadius:10, border:"none", background:"#3b82f6", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700 }}>{quizIdx < QUIZ.length-1 ? "Câu tiếp →" : "Tự đánh giá →"}</button>
              )}
            </div>
          </div>
        )}

        {/* ── ASSESS TAB ── */}
        {tab === "assess" && (
          <div className="fade-up">
            <p style={{ textAlign:"center", fontSize:13, color:"#667799", marginBottom:20 }}>Đánh giá mức độ áp dụng tại đơn vị anh/chị hiện nay</p>
            {MECHANISMS.map(m => (
              <div key={m.id} style={{ background:"rgba(255,255,255,.03)", borderRadius:12, padding:14, marginBottom:10, border:"1px solid rgba(255,255,255,.06)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                  <span style={{ fontSize:22 }}>{m.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:m.color }}>{m.name}</div>
                  </div>
                  <span style={{ fontSize:18, fontWeight:900, color: assessments[m.id]<=1 ? "#ef4444" : assessments[m.id]<=2 ? "#f59e0b" : assessments[m.id]<=3 ? "#10b981" : "#8b5cf6" }}>
                    {["","❌","⚠️","✅","🌟"][assessments[m.id]]}
                  </span>
                </div>
                <input type="range" min="1" max="4" value={assessments[m.id]} onChange={e => setAssessments(p => ({...p,[m.id]:+e.target.value}))}
                  style={{ background:`linear-gradient(to right, ${m.color} 0%, ${m.color} ${(assessments[m.id]-1)/3*100}%, rgba(255,255,255,.1) ${(assessments[m.id]-1)/3*100}%, rgba(255,255,255,.1) 100%)` }} />
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#556688", marginTop:4 }}>
                  <span>1 — Chưa có</span><span>2 — Có nhưng chưa nhất quán</span><span>3 — Áp dụng tốt</span><span>4 — Xuất sắc</span>
                </div>
              </div>
            ))}
            <div style={{ textAlign:"center", marginTop:16 }}>
              <button onClick={() => setTab("results")} style={{ padding:"12px 32px", borderRadius:10, border:"none", background:"linear-gradient(135deg, #10b981, #059669)", color:"#fff", cursor:"pointer", fontSize:14, fontWeight:700 }}>Xem kết quả →</button>
            </div>
          </div>
        )}

        {/* ── RESULTS TAB ── */}
        {tab === "results" && (
          <div className="fade-up">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:20 }}>
              {/* Quiz Score */}
              <div style={{ background:"rgba(59,130,246,.08)", borderRadius:14, padding:16, border:"1px solid rgba(59,130,246,.2)", textAlign:"center" }}>
                <div style={{ fontSize:11, color:"#3b82f6", fontWeight:600, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>⚡ Thử thách tình huống</div>
                <div style={{ fontSize:36, fontWeight:900, color:"#3b82f6" }}>{quizAnswers.length > 0 ? quizScore : "—"}</div>
                <div style={{ fontSize:12, color:"#667799" }}>/ {QUIZ.length} câu đúng</div>
                {quizAnswers.length === 0 && <div style={{ fontSize:11, color:"#556688", marginTop:6 }}>Chưa làm bài → <span style={{ color:"#3b82f6", cursor:"pointer", textDecoration:"underline" }} onClick={() => { setTab("quiz"); setQuizIdx(0); setQuizAnswers([]); setQuizSelected(null); setQuizSubmitted(false); }}>Bắt đầu</span></div>}
              </div>

              {/* Self-Assessment */}
              <div style={{ background:"rgba(16,185,129,.08)", borderRadius:14, padding:16, border:"1px solid rgba(16,185,129,.2)", textAlign:"center" }}>
                <div style={{ fontSize:11, color:"#10b981", fontWeight:600, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>📊 Mức áp dụng trung bình</div>
                <div style={{ fontSize:36, fontWeight:900, color: assessAvg < 2 ? "#ef4444" : assessAvg < 3 ? "#f59e0b" : "#10b981" }}>{assessAvg.toFixed(1)}</div>
                <div style={{ fontSize:12, color:"#667799" }}>/ 4.0 điểm</div>
              </div>
            </div>

            {/* Radar-like breakdown */}
            <div style={{ background:"rgba(255,255,255,.03)", borderRadius:14, padding:16, border:"1px solid rgba(255,255,255,.06)", marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#d0d8f0", marginBottom:12 }}>Chi tiết từng cơ chế tại đơn vị</div>
              {MECHANISMS.map(m => {
                const v = assessments[m.id];
                const labels = ["","Chưa có — Cần xây dựng ngay","Có nhưng chưa nhất quán — Cần chuẩn hóa","Áp dụng tốt — Duy trì & mở rộng","Xuất sắc — Có thể chia sẻ kinh nghiệm"];
                return (
                  <div key={m.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                    <span style={{ fontSize:16, width:24 }}>{m.icon}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
                        <span style={{ fontSize:11, fontWeight:600, color:m.color }}>{m.name}</span>
                        <span style={{ fontSize:11, color: v<=1?"#ef4444":v<=2?"#f59e0b":v<=3?"#10b981":"#8b5cf6", fontWeight:700 }}>{v}/4</span>
                      </div>
                      <div style={{ height:6, background:"rgba(255,255,255,.08)", borderRadius:3, overflow:"hidden" }}>
                        <div style={{ width:`${(v/4)*100}%`, height:"100%", background:m.color, borderRadius:3, transition:"width .5s" }} />
                      </div>
                      <div style={{ fontSize:10, color:"#556688", marginTop:2 }}>{labels[v]}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recommendations */}
            {(() => {
              const weak = MECHANISMS.filter(m => assessments[m.id] <= 2);
              if (weak.length === 0) return (
                <div style={{ background:"rgba(16,185,129,.08)", borderRadius:12, padding:14, border:"1px solid rgba(16,185,129,.15)", textAlign:"center" }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"#10b981", marginBottom:4 }}>🎉 Xuất sắc!</div>
                  <div style={{ fontSize:12, color:"#99a4bb" }}>Đơn vị anh/chị đã áp dụng tốt cả 5 cơ chế. Hãy duy trì và chia sẻ kinh nghiệm!</div>
                </div>
              );
              return (
                <div style={{ background:"rgba(245,158,11,.06)", borderRadius:12, padding:14, border:"1px solid rgba(245,158,11,.15)" }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#f59e0b", marginBottom:8 }}>🎯 Ưu tiên cải thiện trong tháng tới</div>
                  {weak.map(m => (
                    <div key={m.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <span style={{ fontSize:16 }}>{m.icon}</span>
                      <div>
                        <div style={{ fontSize:12, fontWeight:600, color:m.color }}>{m.name}</div>
                        <div style={{ fontSize:11, color:"#8899bb" }}>Bắt đầu: {m.principles[0].name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN APP — ROLE SELECTION
   ═══════════════════════════════════════════════════ */
export default function App() {
  const [role, setRole] = useState(null); // null | "instructor" | "student"

  if (role === "instructor") return <><style>{CSS}</style><InstructorMode onBack={() => setRole(null)} /></>;
  if (role === "student") return <StudentMode onBack={() => setRole(null)} />;

  return (
    <div style={{ minHeight:"100vh", background:bg, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <style>{CSS}</style>
      <div style={{ maxWidth:600, width:"100%", textAlign:"center" }}>
        <div className="fade-up" style={{ marginBottom:32 }}>
          <div style={{ fontSize:56, marginBottom:12 }}>🎯</div>
          <h1 style={{ color:"#fff", fontSize:"clamp(22px,5vw,32px)", fontWeight:900, lineHeight:1.3, marginBottom:8 }}>
            5 Cơ chế & Nguyên tắc<br />Quản lý Điều hành
          </h1>
          <p style={{ color:"#667799", fontSize:14, lineHeight:1.6 }}>
            Gamification học tập tương tác<br />
            <span style={{ fontSize:12, color:"#445566" }}>Chuyên đề 2 — Nâng cao năng lực điều hành & TNKH</span>
          </p>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          {/* Instructor Card */}
          <div className="fade-up card-hover" style={{ animationDelay:".15s", background:"rgba(139,92,246,.08)", borderRadius:16, padding:24, border:"2px solid rgba(139,92,246,.2)", cursor:"pointer", textAlign:"center" }} onClick={() => setRole("instructor")}>
            <div style={{ fontSize:40, marginBottom:12 }}>👨‍🏫</div>
            <div style={{ fontSize:16, fontWeight:800, color:"#a78bfa", marginBottom:6 }}>GIẢNG VIÊN</div>
            <div style={{ fontSize:11, color:"#8899bb", lineHeight:1.6 }}>Trình chiếu trên lớp<br />Bật/tắt cơ chế, quan sát tác động kép</div>
          </div>

          {/* Student Card */}
          <div className="fade-up card-hover" style={{ animationDelay:".25s", background:"rgba(16,185,129,.08)", borderRadius:16, padding:24, border:"2px solid rgba(16,185,129,.2)", cursor:"pointer", textAlign:"center" }} onClick={() => setRole("student")}>
            <div style={{ fontSize:40, marginBottom:12 }}>🎓</div>
            <div style={{ fontSize:16, fontWeight:800, color:"#34d399", marginBottom:6 }}>HỌC VIÊN</div>
            <div style={{ fontSize:11, color:"#8899bb", lineHeight:1.6 }}>Khám phá cơ chế, thử thách tình huống<br />Tự đánh giá đơn vị</div>
          </div>
        </div>

        <div style={{ marginTop:24, fontSize:11, color:"#334455" }}>EVNSPC — Chương trình Phát triển Năng lực Quản trị</div>
      </div>
    </div>
  );
}
