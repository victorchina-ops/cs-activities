using System;

class Program
{
    static void Main()
    {
        int n = 5; double d = 2.5; string s = "x";
        Console.WriteLine($"n={n}, d={d}, s={s}");
        Console.WriteLine($"{n * 2} {d:F2} {n,4}| {s,-3}| {{brace}}");
        Console.WriteLine($"{(n > 3 ? "big" : "small")}");
        var v = 5; var w = "str"; var u = 2.5;
        Console.WriteLine(v + w + u);
    }
}
