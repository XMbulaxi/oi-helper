# 函数与结构体

## 函数：把重复的代码打包

```cpp
double dist(double x1, double y1, double x2, double y2) {
    return sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
}
```

- 写函数让代码更短、更好检查。
- 函数内的变量出了函数就没了。想在函数里修改外面的变量，用**引用**：`void add(int &x) { x++; }`。

## 结构体：把相关数据打包

```cpp
struct Student {
    string name;
    int chinese, math, english;
    int total() { return chinese + math + english; }
};

Student s[1005];
```

一个学生有好几项信息时，用结构体比开好几个数组清楚得多。

## 结构体排序

```cpp
bool cmp(Student a, Student b) {
    if (a.total() != b.total()) return a.total() > b.total();  // 总分高的在前
    return a.name < b.name;                                     // 总分相同按名字
}
sort(s + 1, s + n + 1, cmp);
```

## 递归初体验

函数可以调用自己。计算阶乘：

```cpp
long long fact(int n) {
    if (n == 1) return 1;        // 出口
    return n * fact(n - 1);
}
```

递归一定要有**出口**，否则会无限调用下去。

## 常见错误

1. 有返回值的函数忘记写 `return`。
2. 想修改参数却没用引用。
3. `cmp` 函数里写了 `>=`，可能导致运行错误。比较函数只能用严格的 `<` 或 `>`。

## 做题建议

P5735～P5739 一题练一个用法。P5461 赦免战俘是很好的递归练习。P5740、P5742 练结构体。
