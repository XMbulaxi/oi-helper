# 最短路

> **学完能做到**：用 Dijkstra 求非负权图的单源最短路；用 Floyd 求所有点对的最短路；了解 SPFA；用 BFS 处理边权全为 1 的情况；求最短路条数。
> **前置知识**：图的存储、BFS、堆（priority_queue）。

---

## 1. 问题

带权图中，求从起点 s 到其他每个点的最短距离。

- 边权都是 1 → **BFS** 就够了。
- 边权非负 → **Dijkstra**。
- 有负边权 → **SPFA / Bellman-Ford**。
- 要求任意两点之间 → **Floyd**（n ≤ 几百）。

## 2. 松弛

所有最短路算法的核心操作：

```cpp
if (dis[u] + w < dis[v]) dis[v] = dis[u] + w;
```

意思是：如果经过 u 再走到 v 更近，就更新 v 的距离。

## 3. Dijkstra 算法

### 思路

把点分成两类：**已确定**最短距离的、还没确定的。

1. 一开始 dis[s] = 0，其他 dis = ∞。
2. 每次从**没确定**的点中选 dis **最小**的 u，它的距离就确定了。
3. 用 u 去松弛它的所有邻居。
4. 重复直到所有点都确定。

**为什么选最小的就确定了？** 因为边权非负，从别的没确定的点绕过来只会更远。（有负边时这个推理就不成立了。）

### 手推

```
边：1→2 (2)，1→3 (5)，2→3 (1)，2→4 (6)，3→4 (2)
起点 1

确定 1（dis=0）：更新 dis[2]=2，dis[3]=5
确定 2（dis=2）：更新 dis[3]=min(5, 2+1)=3，dis[4]=8
确定 3（dis=3）：更新 dis[4]=min(8, 3+2)=5
确定 4（dis=5）
结果：0 2 3 5
```

### 堆优化模板

用小根堆快速找到 dis 最小的点，复杂度 O(m log m)：

```cpp
const long long INF = 1e18;
vector<pair<int, int>> g[N];   // g[u] = {v, w}
long long dis[N];
bool done[N];

void dijkstra(int s, int n) {
    fill(dis + 1, dis + n + 1, INF);
    dis[s] = 0;
    priority_queue<pair<long long, int>, vector<pair<long long, int>>, greater<>> pq;   // {距离, 点}
    pq.push({0, s});
    while (!pq.empty()) {
        auto [d, u] = pq.top(); pq.pop();
        if (done[u]) continue;           // 同一个点可能在堆里有多份，只处理第一次
        done[u] = true;
        for (auto [v, w] : g[u]) {
            if (dis[u] + w < dis[v]) {
                dis[v] = dis[u] + w;
                pq.push({dis[v], v});
            }
        }
    }
}
```

要点：

- 堆里存 `{距离, 点}`，因为 pair 先比较 first。
- `greater<>` 让它变成小根堆。
- `done` 数组防止重复处理（懒惰删除）。

## 4. Floyd 算法

求**所有点对**之间的最短路。

d[k][i][j] = 只允许经过编号 1～k 的点作为中转时，i 到 j 的最短路。第 k 个点要么用、要么不用：

d[i][j] = min(d[i][j], d[i][k] + d[k][j])

```cpp
// 初始化：d[i][i] = 0，有边 d[u][v] = w，其余 INF
for (int k = 1; k <= n; k++)          // k 必须在最外层！
    for (int i = 1; i <= n; i++)
        for (int j = 1; j <= n; j++)
            d[i][j] = min(d[i][j], d[i][k] + d[k][j]);
```

O(n³)，n ≤ 400 左右。

> ⚠️ INF 不要设成 `INT_MAX`，两个相加会溢出。用 `0x3f3f3f3f`（约 10⁹，两个相加不超过 int）或 long long 的 1e18 并小心相加。

### 例：灾后重建（P1119）

村庄 i 在时间 tᵢ 重建好（t 递增），多次询问"在时间 T，x 到 y 的最短路"（只能经过已重建的村庄）。

Floyd 的 k 循环**按重建时间顺序**加入中转点：处理一个询问前，把所有 tₖ ≤ T 的 k 都做完中转。这道题能帮你真正理解 Floyd 中 k 的含义。

## 5. SPFA（了解）

队列优化的 Bellman-Ford，可以处理负边权：

```cpp
void spfa(int s) {
    fill(dis, dis + N, INF);
    dis[s] = 0;
    queue<int> q; q.push(s); inq[s] = true;
    while (!q.empty()) {
        int u = q.front(); q.pop(); inq[u] = false;
        for (auto [v, w] : g[u])
            if (dis[u] + w < dis[v]) {
                dis[v] = dis[u] + w;
                if (!inq[v]) { q.push(v); inq[v] = true; }
            }
    }
}
```

最坏 O(nm)，会被特殊构造的数据卡掉。**没有负边权时一律用 Dijkstra。**（P4779 就专门卡了 SPFA。）

## 6. 最短路计数（P1144）

无向无权图，求从 1 到每个点的最短路有几条。

BFS 的同时计数：

```cpp
cnt[1] = 1; dis[1] = 0;
// BFS 中，从 u 到邻居 v：
if (dis[v] == -1) { dis[v] = dis[u] + 1; cnt[v] = cnt[u]; q.push(v); }
else if (dis[v] == dis[u] + 1) cnt[v] = (cnt[v] + cnt[u]) % MOD;
```

带权图同理，在 Dijkstra 松弛时：严格更短就覆盖 cnt，相等就累加。

## 7. 反向图：请柬（P1342）

求 1 到所有点的最短路之和 + 所有点回到 1 的最短路之和（有向图）。

"所有点到 1"：把边**反过来**，就变成"1 到所有点"。跑两次 Dijkstra。

## 8. 二分 + 最短路：通往奥格瑞玛的道路（P1462）

经过的城市要交过路费，血量有限（边权是掉血），求经过城市中**最大收费的最小值**。

二分答案"最大收费 x"，只允许经过收费 ≤ x 的城市，跑一次 Dijkstra 看最少掉血是否不超过血量。

> "最大值最小" → 二分答案；check 里套一个图论算法，是很常见的组合。

## 9. 易错点清单

1. 有负边权还用 Dijkstra。
2. 优先队列默认大根堆，忘了 `greater<>`。
3. 堆里存成 `{点, 距离}`，比较的是点编号。
4. Floyd 的 k 没放在最外层。
5. INF 设太大，相加溢出；设太小，比真实距离还小。
6. 无向图只加了一条边。

## 10. 练习指引

**基础题**

- P3371 单源最短路径（弱化版）：Dijkstra 模板（到不了输出 2³¹-1）。
- P4779 单源最短路径（标准版）：同一份代码，体会为什么不用 SPFA。
- P1339 Heat Wave：无向图最短路，直接 Dijkstra。

**进阶题**

- P1144 最短路计数：BFS 计数，见上文。
- P1119 灾后重建：Floyd，见上文。
- P1342 请柬：正反两次 Dijkstra。
- P1462 通往奥格瑞玛的道路：二分 + Dijkstra。

学完这里，普及组的内容就全部完成了！可以开始做 CSP-J 真题，或者进入提高组。

## 11. 自测

1. 为什么 Dijkstra 不能处理负边权？
2. Floyd 的三层循环，哪个变量必须在最外层？
3. 边权全是 1 的图求最短路，用什么最快？

<details><summary>答案</summary>

1. Dijkstra 认为当前 dis 最小的点已经确定，但负边可能让之后从别的点绕过来更近。
2. 中转点 k。
3. BFS，O(n + m)。

</details>
