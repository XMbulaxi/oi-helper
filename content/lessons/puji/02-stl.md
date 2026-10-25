# STL 常用容器

> **学完能做到**：熟练使用 vector、map、set、pair 等现成工具，少写很多代码。
> **前置知识**：数组、函数、排序。

---

## 1. 什么是 STL

STL（标准模板库）是 C++ 自带的一套工具箱，里面有现成的数据结构（容器）和算法。竞赛中用好 STL，能让代码更短、更不容易错。

## 2. vector：会自动变长的数组

```cpp
vector<int> v;          // 空的
vector<int> w(n, 0);    // n 个 0
v.push_back(3);         // 在末尾加一个元素
v.pop_back();           // 删掉末尾元素
v.size();               // 元素个数
v[i];                   // 访问第 i 个（从 0 开始）
v.back();               // 最后一个
v.clear();              // 清空
v.empty();              // 是否为空
sort(v.begin(), v.end());
for (int x : v) cout << x << " ";
```

**什么时候用**：不知道会有多少个元素；或者每个点要存一串邻居（以后图论里的邻接表）。

二维：`vector<vector<int>> g(n + 1);` 然后 `g[u].push_back(v)`。

## 3. pair：把两个值绑在一起

```cpp
pair<int, string> p = {90, "Tom"};
p.first;   // 90
p.second;  // "Tom"
```

`pair` 自带比较：先比 first，再比 second。所以 `vector<pair<int,int>>` 直接 `sort` 就是按第一个关键字、再按第二个关键字排序。

多于两个值可以用 `tuple` 或 `array<int, 3>`，或者写结构体。

## 4. map：字典（键 → 值）

```cpp
map<string, int> score;
score["Tom"] = 90;         // 添加或修改
score["Amy"] += 5;         // 不存在时会自动创建，值为 0，再加 5
cout << score["Tom"];      // 90
if (score.count("Bob")) {} // 判断是否存在（不会创建）
score.erase("Tom");        // 删除
for (auto &[name, s] : score)   // 按键从小到大遍历
    cout << name << " " << s << endl;
```

- 底层是平衡树，每次操作 O(log n)。
- 键会**自动排序**。
- ⚠️ 用 `score[x]` 查询一个不存在的键，会把它**插进去**。只想判断存在用 `count` 或 `find`。

**典型用途**：数的范围很大（比如 10⁹）时代替"桶"计数；把名字映射成编号。

```cpp
map<int, int> cnt;
for (int i = 1; i <= n; i++) cnt[a[i]]++;   // a[i] 可以到 10⁹
```

## 5. set：自动排序、自动去重的集合

```cpp
set<int> s;
s.insert(5); s.insert(3); s.insert(5);   // s = {3, 5}
s.count(3);        // 1（存在）或 0（不存在）
s.erase(3);
s.size();
*s.begin();        // 最小值
*s.rbegin();       // 最大值
auto it = s.lower_bound(x);   // 第一个 >= x 的元素
auto it2 = s.upper_bound(x);  // 第一个 > x 的元素
if (it != s.end()) cout << *it;
```

**典型用途**：动态地插入、删除，同时随时查询"比 x 大的最小数"之类。

### 迭代器

`s.begin()`、`it` 这些叫**迭代器**，可以理解成"指向某个元素的指针"。`*it` 取出元素，`++it` 移到下一个，`--it` 移到上一个。`s.end()` 指向最后一个元素的**后面**（不是有效元素），找不到时就返回它。

### multiset

允许重复元素的 set。注意 `ms.erase(x)` 会删掉**所有**等于 x 的元素；只删一个要写 `ms.erase(ms.find(x))`。

## 6. unordered_map / unordered_set

用法和 map / set 几乎一样，但底层是哈希表：

- 平均 O(1)，比 map 快。
- **不排序**。
- 极端数据下可能被卡（变慢）。

只需要"有没有、有几个"、不关心顺序时可以用。

## 7. 常用算法函数

```cpp
sort(a + 1, a + n + 1);
reverse(a + 1, a + n + 1);
max_element(a + 1, a + n + 1);        // 返回指向最大值的指针，*取值
unique(a + 1, a + n + 1);             // 去相邻重复
lower_bound(a + 1, a + n + 1, x);     // 有序数组中第一个 >= x 的位置
upper_bound(a + 1, a + n + 1, x);     // 第一个 > x 的位置
fill(a, a + n, 7);                    // 全部填成 7
swap(x, y);
__gcd(a, b);                          // 最大公约数
next_permutation(a + 1, a + n + 1);   // 变成下一个排列，没有了返回 false
```

`next_permutation` 可以很方便地枚举全排列：

```cpp
sort(a + 1, a + n + 1);
do {
    // 处理 a[1..n]
} while (next_permutation(a + 1, a + n + 1));
```

## 8. 例题精讲：寄包柜（P3613）

n 个寄包柜，每个有很多格子（格子编号可到 10⁹），操作：在第 i 个柜子第 j 格放东西 k；查询第 i 个柜子第 j 格里是什么。

开二维数组 n × 10⁹ 肯定不行。但实际用到的格子不多，用 map：

```cpp
map<long long, int> box;               // 键 = i * 一个大数 + j
// 或者 vector<map<int,int>> box(n + 1);
int n, q; cin >> n >> q;
vector<map<int, int>> b(n + 1);
while (q--) {
    int op, i, j; cin >> op >> i >> j;
    if (op == 1) { int k; cin >> k; b[i][j] = k; }
    else cout << b[i][j] << "\n";
}
```

## 9. 例题精讲：木材仓库（P5250）

操作：进货长度为 L 的木材（如果已有同样长度的，输出 `Already Exist`）；取货：要长度 L 的木材，有就取走，没有就取最接近的（一样接近取短的），仓库空了输出 `Empty`。

用 set，找最接近的用 `lower_bound`：

```cpp
set<int> s;
// 取货
if (s.empty()) { cout << "Empty\n"; }
else {
    auto it = s.lower_bound(L);          // 第一个 >= L
    int pick;
    if (it == s.end()) pick = *prev(it); // 全都比 L 小，取最大的
    else if (it == s.begin()) pick = *it;
    else {
        int big = *it, small = *prev(it);
        pick = (L - small <= big - L) ? small : big;   // 一样近取短的
    }
    cout << pick << "\n";
    s.erase(pick);
}
```

## 10. 易错点清单

1. 用 `m[x]` 判断存在，结果把 x 插进去了。
2. `s.end()` 不是有效元素，不能取 `*`。
3. `multiset::erase(x)` 会删掉所有 x。
4. 在遍历 set/map 时删除元素要小心（用 `it = s.erase(it)`）。
5. `vector` 在函数里传参会复制，大的要用引用 `vector<int> &v`。

## 11. 练习指引

**基础题**

- P3613 寄包柜：见例题。
- P4305 不重复数字：每组数据按顺序输出第一次出现的数。用 `unordered_set` 记录出现过的。数据量大，注意用快速输入输出（`ios::sync_with_stdio(false); cin.tie(0);`）。
- P5250 木材仓库：见例题。

**进阶题**

- P5266 学籍管理：插入/修改、查询、删除、统计人数，直接用 `map<string, int>`。
- P1918 保龄球：每个瓶子数对应一个位置，用 `map<int, int>` 存"数量 → 位置"。

## 12. 自测

1. 想统计范围在 1～10⁹ 的 n 个数各出现几次，用什么？
2. set 里找"大于 x 的最小数"用哪个函数？
3. `map<string,int> m; if (m["a"] == 0) ...` 之后，m 的大小是多少？

<details><summary>答案</summary>

1. `map<int, int>`（或 `unordered_map`）。
2. `upper_bound(x)`。
3. 1。查询 `m["a"]` 时把 "a" 插入了。

</details>
