using System;

class Program
{
    static int Fact(int n)
    {
        if (n <= 1) return 1;
        return n * Fact(n - 1);
    }

    static int Fib(int n)
    {
        if (n < 2) return n;
        return Fib(n - 1) + Fib(n - 2);
    }

    static void Main()
    {
        Console.WriteLine(Fact(5));
        Console.WriteLine(Fact(12));
        Console.WriteLine(Fact(13));
        Console.WriteLine(Fib(15));
    }
}
