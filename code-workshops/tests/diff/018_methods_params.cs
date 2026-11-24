using System;

class Program
{
    static int Add(int a, int b)
    {
        return a + b;
    }

    static double Average(int a, int b)
    {
        return (a + b) / 2.0;
    }

    static void PrintLine(string s, int times)
    {
        Console.WriteLine(s + times);
    }

    static int Square(int x) { return x * x; }

    static void Main()
    {
        Console.WriteLine(Add(3, 4));
        Console.WriteLine(Average(3, 4));
        PrintLine("n=", Add(1, 2));
        Console.WriteLine(Square(Square(3)) + Add(Square(2), 1));
        double d = Add(1, 2);
        Console.WriteLine(d);
        Console.WriteLine(Average(1, 2) > 1.4);
    }
}
