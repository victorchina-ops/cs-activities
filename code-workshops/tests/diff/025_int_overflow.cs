using System;

class Program
{
    static void Main()
    {
        int a = int.MaxValue;
        a++;
        Console.WriteLine(a);
        a = int.MaxValue;
        Console.WriteLine(a * 2);
        Console.WriteLine(a + a);
        Console.WriteLine(-a - 5);
        int b = 100000;
        Console.WriteLine(b * b);
        int c = int.MinValue;
        Console.WriteLine(-c);
        Console.WriteLine(c - 1);
        Console.WriteLine(int.MaxValue);
        Console.WriteLine(int.MinValue);
        int f = 1;
        for (int i = 1; i <= 15; i++) f = f * i;
        Console.WriteLine(f);
    }
}
