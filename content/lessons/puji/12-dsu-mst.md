# 并查集与最小生成树

## 并查集

维护"哪些元素在同一个集合里"，支持两种操作：合并两个集合、查询两个元素是否在同一集合。

```cpp
int fa[N];
void init(int n) { for (int i = 1; i <= n; i++) fa[i] = i; }
int find(int x) { return fa[x] == x ? x : fa[x] = find(fa[x]); }  // 路径压缩
void unite(int x, int y) { fa[find(x)] = find(y); }
bool same(int x, int y) { return find(x) == find(y); }
```

路径压缩后，每次操作几乎是 O(1)。

**典型应用：** 亲戚关系（P1551）、判断图是否连通、统计连通块个数。

## 最小生成树

在一个连通的带权无向图里，选 n - 1 条边把所有点连起来，使总边权最小。

**Kruskal 算法**（配合并查集，推荐）：

1. 把所有边按边权从小到大排序。
2. 依次看每条边，如果两个端点还不在同一集合，就选这条边并合并。
3. 选够 n - 1 条边就结束。

```cpp
sort(e + 1, e + m + 1, [](Edge a, Edge b) { return a.w < b.w; });
for (int i = 1; i <= m; i++) {
    if (!same(e[i].u, e[i].v)) {
        unite(e[i].u, e[i].v);
        ans += e[i].w; cnt++;
    }
}
if (cnt < n - 1) 图不连通;
```

## 常见错误

1. 忘记初始化 `fa[i] = i`。
2. 合并时写成 `fa[x] = y`，而不是合并两个**根**。
3. 最小生成树没判断图不连通（P3366 要输出 `orz`）。

## 做题建议

P3367 写熟并查集模板，P1551 直接应用，P3366 写熟 Kruskal。
