import { describe, it, expect, vi } from "vitest";
import {
  buildSendGroups,
  groupsToSend,
  oversizedGroups,
  canSubmit,
  buildOrderPayload,
  keysAreDistinct,
  MAX_ITEMS_PER_ORDER,
  restoreSendGroups, classifySendResponse, executeSendAttempt,
  type GroupableLine,
  type PriorSendState,
} from "../warehouse-order-grouping";

let n = 0;
const keys = () => `key-${++n}`;
const resetKeys = () => { n = 0; };

function line(over: Partial<GroupableLine> = {}): GroupableLine {
  return {
    drugId: "d1",
    barcode: "111",
    quantity: 2,
    warehouseId: "wh-1",
    warehouseName: "نسيم البحر",
    supplierName: "التفاح الأخضر",
    unitPrice: 1000,
    ...over,
  };
}

// ── §189 / §380: التقسيم ─────────────────────────────────────────────────────
describe("buildSendGroups — التقسيم بالمذخر", () => {
  it("أصناف لمذخرين تُنتج مجموعتين بالأصناف الصحيحة فقط", () => {
    resetKeys();
    const groups = buildSendGroups(
      [
        line({ drugId: "a", barcode: "111", warehouseId: "wh-1" }),
        line({ drugId: "b", barcode: "222", warehouseId: "wh-2", warehouseName: "الفرات" }),
        line({ drugId: "c", barcode: "333", warehouseId: "wh-1" }),
      ],
      keys
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].warehouseId).toBe("wh-1");
    expect(groups[0].lines.map((l) => l.drugId)).toEqual(["a", "c"]);
    expect(groups[1].lines.map((l) => l.drugId)).toEqual(["b"]);
  });

  it("التجميع بالمعرّف لا بالاسم — مذخران بنفس الاسم لا يندمجان", () => {
    resetKeys();
    const groups = buildSendGroups(
      [
        line({ drugId: "a", warehouseId: "wh-1", warehouseName: "نسيم البحر" }),
        line({ drugId: "b", warehouseId: "wh-2", warehouseName: "نسيم البحر" }),
      ],
      keys
    );
    expect(groups).toHaveLength(2);
  });

  it("الأسطر غير القابلة للإرسال لا تدخل أي مجموعة (§382)", () => {
    resetKeys();
    const groups = buildSendGroups(
      [line({ drugId: "a" }), line({ drugId: "b", warehouseId: null, warehouseName: null })],
      keys
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].lines.map((l) => l.drugId)).toEqual(["a"]);
  });

  it("يجمع أسماء الموردين للفصل داخل المجموعة بلا تكرار", () => {
    resetKeys();
    const groups = buildSendGroups(
      [
        line({ drugId: "a", supplierName: "شبر" }),
        line({ drugId: "b", supplierName: "شبر" }),
        line({ drugId: "c", supplierName: "نغم الدواء" }),
      ],
      keys
    );
    expect(groups[0].supplierNames).toEqual(["شبر", "نغم الدواء"]);
  });

  it("الترتيب مستقر بين استدعاءين بنفس المدخلات (§194)", () => {
    const input = [
      line({ drugId: "a", warehouseId: "wh-2" }),
      line({ drugId: "b", warehouseId: "wh-1" }),
      line({ drugId: "c", warehouseId: "wh-2" }),
    ];
    resetKeys();
    const one = buildSendGroups(input, keys).map((g) => [g.warehouseId, ...g.lines.map((l) => l.drugId)]);
    resetKeys();
    const two = buildSendGroups(input, keys).map((g) => [g.warehouseId, ...g.lines.map((l) => l.drugId)]);
    expect(one).toEqual(two);
  });
});

// ── §386 / §191: المفاتيح ────────────────────────────────────────────────────
describe("مفاتيح منع التكرار", () => {
  it("مفتاح مستقل لكل مجموعة — لا يُعاد استعماله لمذخرين", () => {
    resetKeys();
    const groups = buildSendGroups(
      [line({ drugId: "a", warehouseId: "wh-1" }), line({ drugId: "b", warehouseId: "wh-2" })],
      keys
    );
    expect(groups[0].idempotencyKey).not.toBe(groups[1].idempotencyKey);
    expect(keysAreDistinct(groups)).toBe(true);
  });

  it("مفتاح واحد لكل مجموعة مهما كثرت أسطرها", () => {
    resetKeys();
    const groups = buildSendGroups(
      [line({ drugId: "a" }), line({ drugId: "b" }), line({ drugId: "c" })],
      keys
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].idempotencyKey).toBe("key-1");
  });
});

// ── §192 / §193 / §385: الاسترداد وإعادة المحاولة ────────────────────────────
describe("استرداد الحالة السابقة", () => {
  const prior = (status: PriorSendState["status"]): PriorSendState[] => [
    { warehouseId: "wh-1", idempotencyKey: "old-key", status, orderNumber: "WO-9", payload: { ...buildOrderPayload(buildSendGroups([line()], () => "old-key")[0], "branch", "original" ) } },
  ];

  it("مجموعة أُرسلت: تحتفظ بمفتاحها وحالتها ولا تُعاد (§195)", () => {
    resetKeys();
    const groups = buildSendGroups([line()], keys, prior("SENT"));
    expect(groups[0].idempotencyKey).toBe("old-key");
    expect(groups[0].status).toBe("SENT");
    expect(groups[0].orderNumber).toBe("WO-9");
    expect(groupsToSend(groups)).toHaveLength(0);
  });

  it("نتيجة مجهولة: **نفس** المفتاح يُعاد إرساله، لا مفتاح جديد (§192)", () => {
    resetKeys();
    const groups = buildSendGroups([line()], keys, prior("UNKNOWN"));
    expect(groups[0].idempotencyKey).toBe("old-key");
    // ما زالت ضمن ما يُرسَل — الخادم يحسمها بنفس المفتاح دون تكرار.
    expect(groupsToSend(groups)).toHaveLength(1);
  });

  it("مجموعة فشلت برفض صريح: مفتاح جديد لأنها لم تُنشئ طلباً (§193)", () => {
    resetKeys();
    const groups = buildSendGroups([line()], keys, prior("FAILED"));
    expect(groups[0].idempotencyKey).toBe("key-1");
    expect(groups[0].status).toBe("PENDING");
  });

  it("حالة محفوظة لمذخر لم يعد في القائمة لا تُسرّب مفتاحها لغيره", () => {
    resetKeys();
    const groups = buildSendGroups(
      [line({ warehouseId: "wh-2", warehouseName: "الفرات" })],
      keys,
      prior("SENT")
    );
    expect(groups[0].idempotencyKey).toBe("key-1");
    expect(groups[0].status).toBe("PENDING");
  });

  it("نجاح الأولى وفشل الثانية لا يؤدي لإعادة إرسال الأولى (§384)", () => {
    resetKeys();
    const groups = buildSendGroups(
      [line({ drugId: "a", warehouseId: "wh-1" }), line({ drugId: "b", warehouseId: "wh-2" })],
      keys,
      [
        { warehouseId: "wh-1", idempotencyKey: "k1", status: "SENT", orderNumber: "WO-1", payload: buildOrderPayload(buildSendGroups([line({drugId:"a"})], () => "k1")[0], "branch", null) },
        { warehouseId: "wh-2", idempotencyKey: "k2", status: "FAILED" },
      ]
    );
    const toSend = groupsToSend(groups);
    expect(toSend.map((g) => g.warehouseId)).toEqual(["wh-2"]);
  });
});

// ── §197 / §387: الحد ────────────────────────────────────────────────────────
describe("حد 100 صنف", () => {
  const many = (count: number, warehouseId = "wh-1") =>
    Array.from({ length: count }, (_, i) => line({ drugId: `d${i}`, barcode: `b${i}`, warehouseId }));

  it("تجاوز الحد يُكتشف قبل الإرسال ولا يُقسَّم المذخر تلقائياً", () => {
    resetKeys();
    const groups = buildSendGroups(many(MAX_ITEMS_PER_ORDER + 1), keys);
    expect(groups).toHaveLength(1);
    expect(oversizedGroups(groups)).toHaveLength(1);
    const verdict = canSubmit(groups);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("نسيم البحر");
  });

  it("الحد بالضبط مسموح", () => {
    resetKeys();
    const groups = buildSendGroups(many(MAX_ITEMS_PER_ORDER), keys);
    expect(oversizedGroups(groups)).toHaveLength(0);
    expect(canSubmit(groups).ok).toBe(true);
  });

  it("قائمة فارغة لا تُرسَل", () => {
    expect(canSubmit([]).ok).toBe(false);
  });
});

// ── §383 / §194: الحمولة ─────────────────────────────────────────────────────
describe("buildOrderPayload", () => {
  it("السعر المجهول يُرسَل 0 لا كعرض مجاني", () => {
    resetKeys();
    const [g] = buildSendGroups([line({ unitPrice: null })], keys);
    const payload = buildOrderPayload(g, "branch-1", null);
    expect(payload.items[0].unitPrice).toBe(0);
  });

  it("السعر غير الموجب يُطبَّع إلى 0", () => {
    resetKeys();
    const [g] = buildSendGroups([line({ unitPrice: -5 })], keys);
    expect(buildOrderPayload(g, "b", null).items[0].unitPrice).toBe(0);
  });

  it("ترتيب البنود يطابق ترتيب المجموعة تماماً في كل بناء", () => {
    resetKeys();
    const [g] = buildSendGroups(
      [line({ drugId: "a", barcode: "1" }), line({ drugId: "b", barcode: "2" }), line({ drugId: "c", barcode: "3" })],
      keys
    );
    const a = buildOrderPayload(g, "b1", null).items.map((i) => i.barcode);
    const b = buildOrderPayload(g, "b1", null).items.map((i) => i.barcode);
    expect(a).toEqual(["1", "2", "3"]);
    expect(b).toEqual(a);
  });

  it("الملاحظة الفارغة تصير null لا سلسلة فارغة", () => {
    resetKeys();
    const [g] = buildSendGroups([line()], keys);
    expect(buildOrderPayload(g, "b", "   ").notes).toBeNull();
    expect(buildOrderPayload(g, "b", "عاجل").notes).toBe("عاجل");
  });

  it("بلا فرع: لا يُرسَل مفتاح branchId إطلاقاً", () => {
    resetKeys();
    const [g] = buildSendGroups([line()], keys);
    expect("branchId" in buildOrderPayload(g, undefined, null)).toBe(false);
  });

  it("المفتاح في الحمولة هو مفتاح المجموعة نفسه", () => {
    resetKeys();
    const [g] = buildSendGroups([line()], keys);
    expect(buildOrderPayload(g, "b", null).idempotencyKey).toBe(g.idempotencyKey);
  });
});


describe('regression: recovery binds status to immutable payload', () => {
  it.each(['SENT','UNKNOWN','SENDING'] as const)('never attaches %s to changed quantities', status => {
    const [original] = buildSendGroups([line()], () => 'old');
    const payload = buildOrderPayload(original, 'branch', 'original');
    expect(() => buildSendGroups([line({quantity:50})], () => 'new', [{...original,status,payload}])).toThrow();
  });
  it('restores an in-flight request as unknown with original notes, order and prices', () => {
    const [g] = buildSendGroups([line()], () => 'original-key');
    g.payload = buildOrderPayload(g, 'branch', 'original notes');
    g.status = 'SENDING';
    const [restored] = restoreSendGroups(JSON.parse(JSON.stringify([g])), 'branch');
    expect(restored.status).toBe('UNKNOWN');
    expect(buildOrderPayload(restored, 'another-branch', 'edited notes')).toEqual(g.payload);
    expect(() => restoreSendGroups([g], 'another-branch')).toThrow();
  });
  it.each([500,502,503,504,408,409])('HTTP %s is unknown, not evidence of rollback', code => {
    expect(classifySendResponse(code, {})).toBe('UNKNOWN');
  });
  it('a malformed success is not recorded as sent', () => {
    expect(classifySendResponse(200, {})).toBe('UNKNOWN');
    expect(classifySendResponse(201, {order:{id:'order'}})).toBe('SENT');
    expect(classifySendResponse(400, {error:'invalid'})).toBe('FAILED');
  });
});


describe('durable send orchestration', () => {
  it('does not contact the server when saving the request fails', async () => {
    const [g] = buildSendGroups([line()], () => 'key');
    const transport = vi.fn();
    await expect(executeSendAttempt(g, 'branch', null, () => { throw new Error('storage full'); }, transport)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it('survives a lost response and reload without sending a different payload', async () => {
    const [g] = buildSendGroups([line()], () => 'key');
    let durable: any;
    const save = (state: any) => { durable = JSON.parse(JSON.stringify(state)); };
    const first = await executeSendAttempt(g, 'branch', 'original', save, async body => {
      expect(durable.status).toBe('SENDING');
      expect(durable.payload).toEqual(body);
      throw new Error('response lost');
    });
    expect(first.status).toBe('UNKNOWN');
    const [restored] = restoreSendGroups([durable], 'branch');
    const originalBody = structuredClone(restored.payload);
    const replay = await executeSendAttempt(restored, 'branch', 'changed', save, async body => {
      expect(body).toEqual(originalBody);
      return {status:200,data:{order:{id:'same-order',orderNumber:'WO-1'}}};
    });
    expect(replay.status).toBe('SENT');
    const transport = vi.fn();
    await executeSendAttempt(replay, 'branch', null, save, transport);
    expect(transport).not.toHaveBeenCalled();
  });
  it('an authentication failure cannot erase an earlier uncertain outcome', () => {
    expect(classifySendResponse(401, {}, true)).toBe('UNKNOWN');
  });
});
