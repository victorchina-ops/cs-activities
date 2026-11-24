using System;

class Program
{
    static void Main()
    {
        int total = 0;
        for (int i = 0; i < 3; i++) { int t = i * 2; total += t; }
        for (int i = 0; i < 3; i++) { int t = i * 3; total += t; }
        { int x = 1; total += x; }
        { int x = 2; total += x; }
        if (total > 0) { int y = 5; total += y; } else { int y = 6; total -= y; }
        Console.WriteLine(total);
    }
}
